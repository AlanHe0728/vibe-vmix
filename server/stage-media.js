'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { AppError } = require('../core/errors');

function encoder() {
  if (process.env.BROADCAST_FFMPEG) return process.env.BROADCAST_FFMPEG;
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = path.join(path.dirname(process.execPath), executable);
  if (fs.existsSync(bundled)) return bundled;
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executable);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (process.platform === 'win32') {
    const standard = path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'vMix',
    );
    let installed;
    try {
      const root = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
      const result = execFileSync(
        'reg.exe',
        [
          'query',
          root + '\\{93D664E9-E81E-4277-9E90-6CDABAC7208F}_is1',
          '/v',
          'InstallLocation',
          '/reg:32',
        ],
        { windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      installed = result
        .toString()
        .match(/InstallLocation\s+REG_SZ\s+([^\r\n]+)/)?.[1]
        ?.trim();
    } catch (_) {
      /* Try the standard install location. */
    }
    const vmix = [installed, standard]
      .filter(Boolean)
      .map((directory) => path.join(directory, 'streaming', 'ffmpeg6.exe'));
    const found = vmix.find((file) => fs.existsSync(file));
    if (found) return found;
  }
  throw new AppError('未找到媒体转换器。请安装带 FFmpeg 6 的 vMix，或配置 BROADCAST_FFMPEG。', 503);
}

function run(file, args, signal, onChild) {
  return new Promise((resolve, reject) => {
    let log = '';
    const child = spawn(file, ['-hide_banner', '-nostdin', ...args], {
      windowsHide: true,
      signal,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    onChild(child);
    child.stderr.on('data', (chunk) => {
      log = (log + chunk.toString()).slice(-16000);
    });
    child.once('error', () => reject(new AppError('媒体转换器启动失败或转换已取消', 503)));
    child.once('close', (code) =>
      code === 0 ? resolve(log) : reject(new AppError('素材转换失败。' + log.trim().slice(-1200))),
    );
  });
}

async function encodeFrames(file, input, output, sequenceFps, packed, signal, onChild) {
  const rawPng = sequenceFps != null;
  let fps = sequenceFps;
  if (!rawPng) {
    const meta = await run(
      file,
      ['-i', input, '-map', '0:v:0', '-frames:v', '0', '-f', 'null', '-'],
      signal,
      onChild,
    );
    const video =
      meta
        .split('Stream mapping:')[0]
        .split('\n')
        .find((line) => line.includes('Video:')) || '';
    const rate = Number(video.match(/([\d.]+) fps/)?.[1]);
    fps = rate > 0 ? Math.min(rate, 60) : 25;
    for (const [display, rational] of [
      [23.98, 24000 / 1001],
      [29.97, 30000 / 1001],
      [59.94, 60000 / 1001],
    ])
      if (rate === display) fps = rational;
  }
  const rgba =
    'scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease,setsar=1,format=rgba';
  const unstack =
    '[0:v]split[l][r];[l]crop=iw/2:ih:0:0,format=rgb24[c];[r]crop=iw/2:ih:iw/2:0,scale=in_range=tv:out_range=full,format=gray[a];[c][a]alphamerge,';
  const filter = (packed ? unstack : '[0:v:0]') + rgba + ',fps=' + fps + '[out]';
  await run(
    file,
    [
      '-loglevel',
      'error',
      '-filter_complex_threads',
      '2',
      ...(rawPng ? ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png'] : []),
      '-i',
      input,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-an',
      '-c:v',
      'png',
      '-threads',
      '4',
      '-compression_level',
      '3',
      '-start_number',
      '0',
      '-f',
      'image2',
      path.join(output, '%07d.png'),
    ],
    signal,
    onChild,
  );
  const frames = fs.readdirSync(output).filter((name) => /^\d{7}\.png$/.test(name));
  if (!frames.length) throw new AppError('未转换出有效画面，请检查源文件');
  const header = fs.openSync(path.join(output, '0000000.png'), 'r');
  const bytes = Buffer.alloc(24);
  try {
    fs.readSync(header, bytes);
  } finally {
    fs.closeSync(header);
  }
  return {
    fps,
    frames: frames.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

module.exports = { encoder, encodeFrames };
