'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { AppError } = require('../core/errors');
const { encoder, encodeFrames } = require('./stage-media');
const { createCaptionPackages } = require('./stage-caption-package');
const { buildPlaybackCache, cacheFolder } = require('./stage-playback-cache');
const sequenceSource = /\.(?:alpha\.mp4|mov)$/i;

const kinds = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.webm': 'video',
  '.mp4': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.gtzip': 'gt',
  '.gtxml': 'gt',
  '.aep': 'ae',
  '.aepx': 'ae',
  '.nbtitle': 'newblue',
  '.nbtlproj': 'newblue',
  '.nbtlpkg': 'newblue',
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
};
const mime = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function createAssetLibrary(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const indexFile = path.join(directory, 'library.json');
  let entries = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
  if (!Array.isArray(entries)) throw Error('素材库索引损坏，请恢复备份');
  const jobs = new Map();
  const folders = new Map();
  let browsing = new Map();
  const children = new Set();
  const frameJobs = new Map();
  let frameQueue = Promise.resolve();
  let disposed = false;
  let converting = false;
  async function writeUpload(req, temporary, limit) {
    if (Number(req.headers['content-length']) > limit) throw new AppError('素材超过上传上限', 413);
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(bytes > limit ? new AppError('素材超过上传上限', 413) : null, chunk);
      },
    });
    await pipeline(req, limiter, fs.createWriteStream(temporary, { flags: 'wx' }));
    if (!bytes) throw new AppError('文件为空');
    return bytes;
  }
  function replaceIndex(next) {
    if (disposed) throw Error('舞台模块已卸载');
    fs.writeFileSync(indexFile + '.tmp', JSON.stringify(next, null, 2));
    fs.renameSync(indexFile + '.tmp', indexFile);
    entries = next;
  }
  function save(entry) {
    replaceIndex([...entries, entry]);
    return entry;
  }
  function get(id) {
    const entry = entries.find((item) => item.id === id) || browsing.get(id);
    if (!entry) throw new AppError('找不到素材', 404);
    return entry;
  }
  function filename(entry) {
    if (entry.file.endsWith('.frames.json'))
      return path.join(frameDirectory(entry), 'sequence.json');
    return entry.sourcePath || path.join(directory, entry.file);
  }
  function frameDirectory(entry) {
    if (!/^[a-f\d]{32}$/i.test(entry.id)) throw new AppError('素材编号无效');
    return path.join(directory, entry.id + '.frames');
  }
  function track(child) {
    children.add(child);
    child.once('close', () => children.delete(child));
  }
  async function convert(entry, input, fps, packed, signal, optimize = false) {
    if (disposed) throw new AppError('舞台模块已卸载', 503);
    const temporary = await fs.promises.mkdtemp(path.join(directory, entry.id + '-frames-'));
    try {
      const ffmpeg = encoder();
      const manifest = await encodeFrames(ffmpeg, input, temporary, fps, packed, signal, track);
      await fs.promises.writeFile(path.join(temporary, 'sequence.json'), JSON.stringify(manifest));
      if (optimize)
        await buildPlaybackCache(ffmpeg, temporary, manifest, signal, track).catch(() => {});
      signal.throwIfAborted();
      await fs.promises.rename(temporary, frameDirectory(entry));
      return manifest;
    } finally {
      await fs.promises.rm(temporary, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 100,
      });
    }
  }
  function prepare(entry) {
    const root = frameDirectory(entry);
    if (fs.existsSync(path.join(root, 'sequence.json')) || !sequenceSource.test(entry.file))
      return Promise.resolve();
    if (frameJobs.has(entry.id)) return frameJobs.get(entry.id);
    const job = frameQueue
      .then(() =>
        convert(
          entry,
          filename(entry),
          null,
          entry.file.endsWith('.alpha.mp4'),
          AbortSignal.timeout(20 * 60 * 1000),
        ),
      )
      .finally(() => frameJobs.delete(entry.id));
    frameQueue = job.catch(() => {});
    frameJobs.set(entry.id, job);
    return job;
  }
  function metadata(name) {
    const extension = path.extname(name).toLowerCase();
    if (!kinds[extension]) throw new AppError('不支持此文件类型');
    const id = crypto.randomBytes(16).toString('hex');
    return {
      id,
      name: path.basename(name).slice(0, 200),
      kind: kinds[extension],
      file: id + extension,
      createdAt: Date.now(),
    };
  }
  function browse(folder) {
    const directory = folders.get(folder);
    if (!directory) throw new AppError('请选择素材文件夹', 404);
    const items = fs.readdirSync(directory, { withFileTypes: true });
    const children = [];
    const files = new Map();
    for (const item of items) {
      const sourcePath = path.join(directory, item.name);
      const id = crypto.createHash('sha256').update(sourcePath).digest('hex').slice(0, 32);
      if (item.isDirectory() && !item.isSymbolicLink()) {
        folders.set(id, sourcePath);
        children.push({ id, name: item.name });
      } else if (item.isFile()) {
        const extension = path.extname(item.name).toLowerCase();
        if (Object.hasOwn(kinds, extension))
          files.set(id, {
            id,
            name: item.name,
            kind: kinds[extension],
            file: id + extension,
            sourcePath,
            available: true,
          });
      }
    }
    browsing = files;
    return {
      folders: children,
      assets: [...files.values()],
      name: path.basename(directory) || directory,
    };
  }
  return {
    captionPackages: createCaptionPackages({
      directory,
      async resolve(reference) {
        const entry = get(reference.slice(0, 32));
        if (entry.file !== reference) throw new AppError('找不到模板素材', 404);
        const sequence = sequenceSource.test(reference) || reference.endsWith('.frames.json');
        if (sequence) await prepare(entry);
        return {
          name: entry.name,
          file: filename(entry),
          frames: sequence && frameDirectory(entry),
        };
      },
      commit(records, persist) {
        if (!records.length) return persist();
        const previous = entries;
        replaceIndex([...entries, ...records]);
        try {
          return persist();
        } catch (error) {
          replaceIndex(previous);
          throw error;
        }
      },
    }),
    list: () => entries.map((entry) => ({ ...entry, available: fs.existsSync(filename(entry)) })),
    get,
    filename,
    prewarm(files) {
      for (const file of new Set(files.filter((value) => sequenceSource.test(value)))) {
        const entry = entries.find((item) => item.file === file);
        if (entry) void prepare(entry).catch(() => {});
      }
    },
    openFolder(sourcePath) {
      if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath))
        throw new AppError('请选择本地文件夹');
      let directory;
      try {
        directory = fs.realpathSync(sourcePath);
        if (!fs.statSync(directory).isDirectory()) throw Error();
      } catch {
        throw new AppError('找不到素材文件夹', 404);
      }
      folders.clear();
      folders.set('root', directory);
      return browse('root');
    },
    browse,
    pin(id) {
      const entry = get(id);
      const existing = entries.find(
        (item) => item.id === id || (entry.sourcePath && item.sourcePath === entry.sourcePath),
      );
      if (existing) return existing;
      const { available, ...record } = entry;
      try {
        return save({ ...record, bytes: fs.statSync(record.sourcePath).size });
      } catch (error) {
        if (error.code === 'ENOENT') throw new AppError('源文件已移动或删除', 404);
        throw error;
      }
    },
    register(sourcePath) {
      if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath))
        throw new AppError('请选择本地工程');
      const entry = metadata(sourcePath);
      if (!['ae', 'newblue', 'gt'].includes(entry.kind))
        throw new AppError('此入口仅登记 GT、AE 和 NewBlue 工程');
      if (!fs.statSync(sourcePath).isFile()) throw new AppError('工程不存在');
      return save({
        ...entry,
        sourcePath: path.resolve(sourcePath),
        bytes: fs.statSync(sourcePath).size,
      });
    },
    async upload(req, name) {
      const entry = metadata(name);
      const target = path.join(directory, entry.file);
      const temporary = target + '.upload';
      try {
        const bytes = await writeUpload(req, temporary, 512 * 1024 * 1024);
        fs.renameSync(temporary, target);
        return save({ ...entry, bytes });
      } catch (error) {
        for (const file of [temporary, target]) {
          try {
            fs.unlinkSync(file);
          } catch (_) {
            /* upload never committed */
          }
        }
        throw error;
      }
    },
    async importMedia(req, res, name, fps) {
      const extension = path.extname(name).toLowerCase();
      if (fps === null && extension !== '.mov') {
        if (!['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm'].includes(extension))
          throw new AppError('请选择 PNG、JPG、WebP、MP4、WebM 或 MOV');
        return this.upload(req, name);
      }
      if (fps !== null && (fps < 1 || fps > 60 || !Number.isFinite(fps) || extension !== '.png'))
        throw new AppError('PNG 序列帧率须为 1–60 fps');
      if (converting) throw new AppError('正在转换另一份素材，请稍后重试', 409);
      encoder();
      const entry = metadata(name.replace(/\.[^.]+$/, '') + '.mp4');
      entry.name = path.basename(name).slice(0, 200) + (fps === null ? '' : '（PNG 序列）');
      entry.file = entry.id + '.frames.json';
      const input = path.join(directory, entry.id + '.source');
      const abort = new AbortController();
      const cancel = () => abort.abort();
      res.once('close', cancel);
      const timer = setTimeout(cancel, 20 * 60 * 1000);
      converting = true;
      let committed = false;
      try {
        await writeUpload(req, input, 2 * 1024 ** 3);
        const sequence = await convert(entry, input, fps, false, abort.signal, true);
        const record = save({ ...entry, sequence });
        committed = true;
        return record;
      } finally {
        clearTimeout(timer);
        res.removeListener('close', cancel);
        await fs.promises.rm(input, { force: true }).catch(() => {});
        if (!committed)
          await fs.promises
            .rm(frameDirectory(entry), { recursive: true, force: true })
            .catch(() => {});
        converting = false;
      }
    },
    async serve(req, res, file) {
      const [reference, frame, extra] = file.split('/');
      const entry =
        entries.find((item) => item.file === reference) || browsing.get(reference.slice(0, 32));
      if (!entry || entry.file !== reference || extra !== undefined)
        throw new AppError('找不到素材', 404);
      let target = filename(entry),
        type = reference.endsWith('.frames.json')
          ? 'application/json; charset=utf-8'
          : mime[path.extname(reference)];
      if (frame !== undefined) {
        if (
          !/\.(?:alpha\.mp4|mov|frames\.json)$/i.test(reference) ||
          !/^(?:sequence\.json|playback\.json|(?:crop-)?\d{7}\.png)$/.test(frame)
        )
          throw new AppError('找不到素材帧', 404);
        await prepare(entry);
        const root = frameDirectory(entry);
        if (frame === 'playback.json') {
          target = path.join(root, cacheFolder, frame);
          if (!fs.existsSync(target)) target = path.join(root, 'sequence.json');
        } else if (frame.startsWith('crop-')) target = path.join(root, cacheFolder, frame.slice(5));
        else target = path.join(root, frame);
        type = frame.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/png';
      }
      if (!type) throw new AppError('找不到素材', 404);
      const stat = await fs.promises.stat(target).catch((error) => {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw new AppError('素材已移动或删除', 404);
        throw error;
      });
      if (!stat.isFile() || !stat.size) throw new AppError('素材无法预览', 404);
      let start = 0,
        end = stat.size - 1,
        partial = false;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range) throw new AppError('不支持此范围', 416);
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end) throw new AppError('范围超出文件', 416);
        partial = true;
      }
      res.writeHead(partial ? 206 : 200, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
        ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(target, { start, end });
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.destroy()).pipe(res);
    },
    renderAE({ id, composition, outputModule }) {
      if ([...jobs.values()].some((job) => job.status === 'running'))
        throw new AppError('已有 AE 渲染任务', 409);
      const entry = get(id);
      if (entry.kind !== 'ae') throw new AppError('请选择 AE 工程');
      if (typeof composition !== 'string' || !composition.trim() || composition.length > 200)
        throw new AppError('请填写合成名称');
      if (typeof outputModule !== 'string' || !outputModule.trim() || outputModule.length > 200)
        throw new AppError('请填写 AE 输出模块模板名称');
      let engine = process.env.BROADCAST_AERENDER;
      const adobe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
      if (!engine && fs.existsSync(adobe)) {
        engine = fs
          .readdirSync(adobe)
          .filter((name) => name.startsWith('Adobe After Effects'))
          .sort()
          .reverse()
          .map((name) => path.join(adobe, name, 'Support Files', 'aerender.exe'))
          .find((file) => fs.existsSync(file));
      }
      if (!engine || !fs.existsSync(engine))
        throw new AppError('未找到 AE 渲染引擎；请安装 After Effects 或设置 BROADCAST_AERENDER');
      const output = metadata(entry.name.replace(/\.[^.]+$/, '') + '.mov');
      const outputFile = path.join(directory, output.file);
      const job = { id: output.id, status: 'running', log: '', asset: null };
      const child = spawn(
        engine,
        [
          '-project',
          filename(entry),
          '-comp',
          composition,
          '-OMtemplate',
          outputModule,
          '-output',
          outputFile,
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      children.add(child);
      jobs.set(job.id, job);
      const append = (chunk) => {
        job.log = (job.log + chunk.toString()).slice(-8000);
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.once('error', (error) => {
        job.status = 'failed';
        job.log = error.message;
        children.delete(child);
      });
      child.once('close', (code) => {
        children.delete(child);
        if (disposed) return;
        try {
          if (code !== 0 || !fs.existsSync(outputFile))
            throw Error('AE 未生成视频，请查看渲染日志');
          job.asset = save({ ...output, bytes: fs.statSync(outputFile).size });
          job.status = 'done';
        } catch (error) {
          job.status = 'failed';
          job.log += '\n' + error.message;
        }
      });
      return job;
    },
    jobs: () => [...jobs.values()].map((job) => ({ ...job })),
    close() {
      disposed = true;
      for (const child of children) child.kill();
      children.clear();
    },
  };
}
module.exports = { createAssetLibrary };
