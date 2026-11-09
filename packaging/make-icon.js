'use strict';
const fs = require('node:fs');
const path = require('node:path');

// An original, flat pitch/football mark. No image service or font dependency.
function polygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i],
      [xj, yj] = vertices[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pixel(x, y) {
  if (
    Math.hypot(Math.max(Math.abs(x - 0.5) - 0.28, 0), Math.max(Math.abs(y - 0.5) - 0.28, 0)) > 0.19
  )
    return [0, 0, 0, 0];
  let color = [29, 53, 62, 255];
  if (x > 0.19 && x < 0.81 && y > 0.2 && y < 0.27) color = [115, 208, 197, 255];
  if (Math.hypot(x - 0.5, y - 0.59) < 0.235) color = [249, 251, 251, 255];
  const pentagon = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    return [0.5 + 0.105 * Math.cos(a), 0.59 + 0.105 * Math.sin(a)];
  });
  if (polygon(x, y, pentagon)) color = [29, 53, 62, 255];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const dx = x - 0.5,
      dy = y - 0.59,
      along = dx * Math.cos(a) + dy * Math.sin(a),
      across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
    if (along > 0.094 && along < 0.235 && across < 0.012 && Math.hypot(dx, dy) < 0.235)
      color = [29, 53, 62, 255];
  }
  return color;
}
function bitmap(size, painter = pixel) {
  const color = Buffer.alloc(size * size * 4),
    mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size),
    samples = 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let v = 0; v < samples; v++)
        for (let u = 0; u < samples; u++) {
          const p = painter((x + (u + 0.5) / samples) / size, (y + (v + 0.5) / samples) / size);
          for (let c = 0; c < 4; c++) sum[c] += p[c];
        }
      const p = sum.map((v) => Math.round(v / (samples * samples))),
        offset = ((size - y - 1) * size + x) * 4;
      color.set([p[2], p[1], p[0], p[3]], offset);
    }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(color.length + mask.length, 20);
  return Buffer.concat([header, color, mask]);
}
function makeIcon(target, painter = pixel) {
  const sizes = [16, 32, 48, 64, 128, 256],
    bitmaps = sizes.map((size) => bitmap(size, painter)),
    header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const at = 6 + i * 16;
    header[at] = header[at + 1] = s === 256 ? 0 : s;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(bitmaps[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += bitmaps[i].length;
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([header, ...bitmaps]));
}
if (require.main === module) makeIcon(path.resolve(__dirname, '../desktop/icon.ico'));
function makeWorkspaceIcon(target) {
  makeIcon(target, (x, y) => {
    if (
      Math.hypot(Math.max(Math.abs(x - 0.5) - 0.29, 0), Math.max(Math.abs(y - 0.5) - 0.29, 0)) >
      0.15
    )
      return [0, 0, 0, 0];
    const left = x > 0.2 && x < 0.46,
      right = x > 0.54 && x < 0.8,
      top = y > 0.2 && y < 0.46,
      bottom = y > 0.54 && y < 0.8;
    if (left && top) return [247, 250, 253, 255];
    if (right && top) return [164, 204, 237, 255];
    if (left && bottom) return [164, 204, 237, 255];
    if (right && bottom) return [247, 250, 253, 255];
    return [22, 102, 173, 255];
  });
}
module.exports = { makeIcon, makeWorkspaceIcon };
