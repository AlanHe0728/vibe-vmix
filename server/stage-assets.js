'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { AppError } = require('../core/errors');

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
};

function createAssetLibrary(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const indexFile = path.join(directory, 'library.json');
  let entries = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
  if (!Array.isArray(entries)) throw Error('素材库索引损坏，请恢复备份');
  const jobs = new Map();
  const children = new Set();
  let disposed = false;
  function save(entry) {
    if (disposed) throw Error('舞台模块已卸载');
    const next = [...entries, entry];
    fs.writeFileSync(indexFile + '.tmp', JSON.stringify(next, null, 2));
    fs.renameSync(indexFile + '.tmp', indexFile);
    entries = next;
    return entry;
  }
  function get(id) {
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw new AppError('找不到素材', 404);
    return entry;
  }
  function filename(entry) {
    return entry.sourcePath || path.join(directory, entry.file);
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
  return {
    list: () => entries.map((entry) => ({ ...entry, available: fs.existsSync(filename(entry)) })),
    get,
    filename,
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
      let bytes = 0;
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > 512 * 1024 * 1024 ? new AppError('单个素材最多 512 MB', 413) : null,
            chunk,
          );
        },
      });
      try {
        await pipeline(req, limiter, fs.createWriteStream(temporary, { flags: 'wx' }));
        if (!bytes) throw new AppError('文件为空');
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
    async serve(req, res, file) {
      const entry = entries.find((item) => item.file === file && !item.sourcePath);
      if (!entry || !mime[path.extname(file)]) throw new AppError('找不到素材', 404);
      const target = filename(entry);
      const stat = await fs.promises.stat(target);
      let start = 0,
        end = stat.size - 1,
        partial = false;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range) throw new AppError('不支持此范围', 416);
        start = Number(range[1]);
        end = range[2] ? Number(range[2]) : end;
        if (start > end || end >= stat.size) throw new AppError('范围超出文件', 416);
        partial = true;
      }
      res.writeHead(partial ? 206 : 200, {
        'Content-Type': mime[path.extname(file)],
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
