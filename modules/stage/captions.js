'use strict';

(function (root) {
  function lines(value) {
    return typeof value === 'string'
      ? value
          .split(/\r\n|\r|\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  }
  function importLyrics(value, lrc) {
    if (!lrc) return lines(value.replace(/^\uFEFF/, ''));
    const cues = [];
    for (const raw of lines(value.replace(/^\uFEFF/, ''))) {
      let rest = raw;
      const times = [];
      let stamp;
      while ((stamp = rest.match(/^\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]\s*/))) {
        times.push(Number(stamp[1]) * 60 + Number(stamp[2]) + Number('0.' + (stamp[3] || '0')));
        rest = rest.slice(stamp[0].length);
      }
      if (rest) for (const time of times) cues.push({ time, text: rest });
    }
    return cues.sort((a, b) => a.time - b.time).map((cue) => cue.text);
  }
  async function readLyrics(file) {
    if (file.size > 1024 * 1024 || !/\.(lrc|txt)$/i.test(file.name))
      throw Error('请选择 1 MB 以内的 LRC 或 TXT 文件');
    const bytes = await file.arrayBuffer();
    let content;
    try {
      const prefix = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      const encoding =
        prefix[0] === 255 && prefix[1] === 254
          ? 'utf-16le'
          : prefix[0] === 254 && prefix[1] === 255
            ? 'utf-16be'
            : 'utf-8';
      content = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
    }
    const entries = importLyrics(content, /\.lrc$/i.test(file.name));
    const result = entries.join('\n');
    if (!result || entries.length > 500 || result.length > 30000)
      throw Error('歌词应包含 1 至 500 句，总长度不超过 30000 字');
    return result;
  }
  const api = { lines, importLyrics, readLyrics };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageCaptions = api;
})(globalThis);
