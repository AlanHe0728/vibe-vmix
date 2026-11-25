'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { AppError } = require('../core/errors');
const { captionTemplate, keys, text } = require('../modules/stage/show');

const magic = Buffer.from('FBPCAP1\n');
const headerLimit = 16 * 1024 * 1024;
const allowed = {
  background: /^\.(?:png|jpe?g|webp|mp4|webm|frames\.json)$/,
  font: /^\.(?:ttf|otf|woff2?)$/,
  latinFont: /^\.(?:ttf|otf|woff2?)$/,
};
const roles = Object.keys(allowed);
const references = (template) => ({
  background: template.background,
  font: template.appearance?.fontAsset,
  latinFont: template.appearance?.latinFontAsset,
});
const frameName = (index) => String(index).padStart(7, '0') + '.png';
const invalid = () => new AppError('字幕模板包无效或不完整');

function normalizeTemplate(template) {
  try {
    return captionTemplate(template);
  } catch (error) {
    throw new AppError(error.message);
  }
}

function sequenceInfo({ frames, fps, width, height } = {}) {
  if (
    ![frames, width, height].every((value) => Number.isSafeInteger(value) && value > 0) ||
    frames >= 1e7 ||
    !Number.isFinite(fps) ||
    fps < 1 ||
    fps > 240
  )
    throw invalid();
  return { frames, fps, width, height };
}

function packageInput(req) {
  const iterator = req[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  return {
    async *take(size) {
      while (size > 0) {
        if (!pending.length) {
          const next = await iterator.next();
          if (next.done) throw invalid();
          pending = next.value;
        }
        const end = Math.min(size, pending.length);
        const chunk = pending.subarray(0, end);
        pending = pending.subarray(end);
        size -= end;
        yield chunk;
      }
    },
    async done() {
      if (pending.length || !(await iterator.next()).done) throw invalid();
    },
  };
}

async function readBytes(input, size) {
  const chunks = [];
  for await (const bytes of input.take(size)) chunks.push(bytes);
  return Buffer.concat(chunks, size);
}

function unpackMetadata(value) {
  try {
    keys(value, ['template', 'assets']);
    keys(value.assets, roles);
    const template = captionTemplate(value.template);
    const refs = references(template);
    const assets = {};
    for (const role of roles) {
      const entry = value.assets[role];
      if (Boolean(entry) !== Boolean(refs[role])) throw invalid();
      if (!entry) continue;
      keys(entry, ['name', 'suffix', 'sizes', 'sequence']);
      const { suffix, sizes } = entry;
      if (typeof suffix !== 'string' || !allowed[role].test(suffix)) throw invalid();
      const sequence = suffix === '.frames.json' ? sequenceInfo(entry.sequence) : null;
      if (
        !Array.isArray(sizes) ||
        sizes.length !== (sequence?.frames || 1) ||
        !sizes.every((size) => Number.isSafeInteger(size) && size > 0)
      )
        throw invalid();
      assets[role] = { name: text(entry.name, 200), suffix, sizes, sequence };
    }
    return { template, assets };
  } catch {
    throw invalid();
  }
}

function createCaptionPackages({ directory, resolve, commit }) {
  return {
    async export(req, res, draft) {
      const template = normalizeTemplate(draft);
      const assets = {};
      const sources = [];
      let bytes = 0;
      for (const [role, reference] of Object.entries(references(template))) {
        if (!reference) continue;
        const { name, file, frames } = await resolve(reference);
        const suffix = frames ? '.frames.json' : path.extname(file).toLowerCase();
        if (!allowed[role].test(suffix)) throw invalid();
        const sequence =
          frames &&
          sequenceInfo(
            JSON.parse(await fs.promises.readFile(path.join(frames, 'sequence.json'), 'utf8')),
          );
        const files = sequence
          ? Array.from({ length: sequence.frames }, (_, index) =>
              path.join(frames, frameName(index)),
            )
          : [file];
        const sizes = [];
        for (const source of files) {
          const stat = await fs.promises.stat(source).catch(() => null);
          if (!stat?.isFile() || !stat.size) throw new AppError('模板素材已移动或缺失', 404);
          bytes += stat.size;
          sizes.push(stat.size);
          sources.push({ source, size: stat.size });
        }
        assets[role] = { name, suffix, sizes, sequence };
      }
      const metadata = Buffer.from(JSON.stringify({ template, assets }));
      if (
        metadata.length > headerLimit ||
        !Number.isSafeInteger(bytes + metadata.length + magic.length + 4)
      )
        throw new AppError('模板包过大', 413);
      const header = Buffer.alloc(magic.length + 4);
      magic.copy(header);
      header.writeUInt32BE(metadata.length, magic.length);
      const length = header.length + metadata.length + bytes;
      const name = template.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') + '.stage-caption';
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': length,
        'Content-Disposition':
          'attachment; filename="subtitle.stage-caption"; filename*=UTF-8\'\'' +
          encodeURIComponent(name).replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16)),
      });
      if (req.method === 'HEAD') return res.end();
      async function* packageBytes() {
        yield header;
        yield metadata;
        for (const { source, size } of sources)
          yield* fs.createReadStream(source, { end: size - 1 });
      }
      await pipeline(Readable.from(packageBytes()), res);
    },
    async import(req, persist) {
      const input = packageInput(req);
      const header = await readBytes(input, magic.length + 4);
      if (!header.subarray(0, magic.length).equals(magic)) throw invalid();
      const size = header.readUInt32BE(magic.length);
      if (!size || size > headerLimit) throw invalid();
      let entry;
      try {
        entry = unpackMetadata(JSON.parse(await readBytes(input, size)));
      } catch {
        throw invalid();
      }
      const { template, assets } = entry;
      const staging = await fs.promises.mkdtemp(path.join(directory, 'caption-package-'));
      const records = {};
      const paths = [];
      const moved = [];
      try {
        for (const [role, { name, suffix, sizes, sequence }] of Object.entries(assets)) {
          const id = randomUUID().replaceAll('-', '');
          const file = id + suffix;
          const location = path.join(staging, sequence ? id + '.frames' : file);
          paths.push(location);
          if (sequence) {
            await fs.promises.mkdir(location);
            await fs.promises.writeFile(
              path.join(location, 'sequence.json'),
              JSON.stringify(sequence),
            );
          }
          for (const [index, bytes] of sizes.entries()) {
            const target = sequence ? path.join(location, frameName(index)) : location;
            await pipeline(
              Readable.from(input.take(bytes)),
              fs.createWriteStream(target, { flags: 'wx' }),
            );
          }
          const kind =
            role !== 'background'
              ? 'font'
              : sequence || /\.(mp4|webm)$/.test(suffix)
                ? 'video'
                : 'image';
          records[role] = {
            id,
            file,
            name,
            kind,
            createdAt: Date.now(),
            ...(sequence ? { sequence } : { bytes: sizes[0] }),
          };
        }
        await input.done();
        for (const location of paths) {
          const target = path.join(directory, path.basename(location));
          fs.renameSync(location, target);
          moved.push(target);
        }
        const imported = {
          ...template,
          id: randomUUID(),
          background: records.background?.file || '',
        };
        if (imported.appearance) {
          imported.appearance.fontAsset = records.font?.file || '';
          if (records.latinFont) imported.appearance.latinFontAsset = records.latinFont.file;
        }
        return commit(Object.values(records), () => persist(imported));
      } catch (error) {
        await Promise.allSettled(
          moved.map((target) => fs.promises.rm(target, { recursive: true, force: true })),
        );
        throw error;
      } finally {
        await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

module.exports = { createCaptionPackages };
