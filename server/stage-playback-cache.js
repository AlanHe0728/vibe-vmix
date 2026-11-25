'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { crc32, deflate } = require('node:zlib');

const compress = promisify(deflate);
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const cacheFolder = 'playback-v1';

function alphaBounds(data, width, height) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0, offset = 3; y < height; y++) {
    for (let x = 0; x < width; x++, offset += 4) {
      if (!data[offset]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  // Keep a transparent margin for filtering when the layer is scaled.
  const left = Math.max(0, x0 - 2);
  const top = Math.max(0, y0 - 2);
  return [left, top, Math.min(width, x1 + 3) - left, Math.min(height, y1 + 3) - top];
}

function chunk(type, bytes) {
  const output = Buffer.allocUnsafe(bytes.length + 12);
  output.writeUInt32BE(bytes.length);
  output.write(type, 4, 'ascii');
  bytes.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
}

async function croppedPng(data, frameWidth, [left, top, width, height]) {
  const rowBytes = width * 4;
  const pixels = Buffer.allocUnsafe((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const input = ((top + y) * frameWidth + left) * 4;
    const output = y * (rowBytes + 1);
    pixels[output] = y === 0 ? 1 : 2; // PNG Sub for the first row, Up for the remainder.
    for (let x = 0; x < rowBytes; x++) {
      const previous = y ? data[input + x - frameWidth * 4] : x >= 4 ? data[input + x - 4] : 0;
      pixels[output + 1 + x] = data[input + x] - previous;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', await compress(pixels, { level: 3 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function buildPlaybackCache(ffmpeg, directory, manifest, signal, track = () => {}) {
  const target = path.join(directory, cacheFolder);
  const ready = path.join(target, 'playback.json');
  try {
    await fs.access(ready);
    return JSON.parse(await fs.readFile(ready, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const { width, height, frames } = manifest;
  if (
    ![width, height, frames].every(Number.isSafeInteger) ||
    width < 1 ||
    height < 1 ||
    width > 1920 ||
    height > 1080 ||
    frames < 1
  )
    throw Error('无法优化无效的序列尺寸');
  const temporary = await fs.mkdtemp(path.join(directory, '.playback-'));
  const child = spawn(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-threads',
      '2',
      '-start_number',
      '0',
      '-i',
      path.join(directory, '%07d.png'),
      '-frames:v',
      String(frames),
      '-an',
      '-pix_fmt',
      'rgba',
      '-threads',
      '1',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { windowsHide: true, signal, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  track(child);
  const exit = new Promise((resolve) => {
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
  const data = Buffer.allocUnsafe(width * height * 4);
  const crops = [];
  let used = 0;
  try {
    for await (const bytes of child.stdout) {
      for (let offset = 0; offset < bytes.length; ) {
        const length = Math.min(data.length - used, bytes.length - offset);
        bytes.copy(data, used, offset, offset + length);
        used += length;
        offset += length;
        if (used !== data.length) continue;
        used = 0;
        const bounds = alphaBounds(data, width, height);
        const keepOriginal = bounds && bounds[2] * bounds[3] >= width * height * 0.92;
        if (bounds && !keepOriginal) {
          const name = String(crops.length).padStart(7, '0') + '.png';
          await fs.writeFile(path.join(temporary, name), await croppedPng(data, width, bounds));
        }
        crops.push(keepOriginal ? false : bounds);
      }
    }
    if (!(await exit) || used || crops.length !== frames) throw Error('未能完整读取序列帧');
    const playback = { ...manifest, crops };
    await fs.writeFile(path.join(temporary, 'playback.json'), JSON.stringify(playback));
    await fs.rename(temporary, target);
    return playback;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { buildPlaybackCache, cacheFolder };
