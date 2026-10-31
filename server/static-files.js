'use strict';

const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { AppError } = require('../core/errors');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative !== '' &&
    !relative.startsWith('..' + path.sep) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function createStaticHandler(mounts) {
  return async function serve(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new AppError('method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }
    if (pathname.includes('\\') || pathname.includes('\0'))
      throw new AppError('not found', 404, 'NOT_FOUND');
    for (const mount of mounts) {
      if (!pathname.startsWith(mount.prefix)) continue;
      const directory = path.resolve(mount.directory);
      const file = path.resolve(directory, pathname.slice(mount.prefix.length));
      if (
        mount.files &&
        !mount.files.includes(path.relative(directory, file).replaceAll(path.sep, '/'))
      )
        continue;
      // Only public assets are served; source, local state and symlinks outside the mount are excluded.
      if (
        !inside(directory, file) ||
        !MIME[path.extname(file).toLowerCase()] ||
        /(^|[\\/])\./.test(path.relative(directory, file))
      )
        continue;
      if (/(^|[\\/])state(?:\.example)?\.json$/i.test(file)) continue;
      let real;
      try {
        real = await fs.realpath(file);
        if (!inside(await fs.realpath(directory), real) || !(await fs.stat(real)).isFile())
          continue;
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue;
        throw error;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()],
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else
        createReadStream(real)
          .on('error', () => res.destroy())
          .pipe(res);
      return;
    }
    throw new AppError('not found', 404, 'NOT_FOUND');
  };
}

module.exports = { createStaticHandler };
