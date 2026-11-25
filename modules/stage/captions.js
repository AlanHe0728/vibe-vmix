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
  function forProgram(state, program) {
    const id = program?.captionTemplateId || state.captionTemplateId;
    return state.captionTemplates.find((item) => item.id === id) || null;
  }
  function layoutTemplate(state) {
    return (
      (state.layers.caption &&
        forProgram(
          state,
          state.programs.find((item) => item.id === state.captionLive?.programId),
        )) ||
      forProgram(state, state.live || state.programs[0])
    );
  }
  function bounds(template) {
    const boxes = template.background
      ? [template.textBox, template.backgroundBox]
      : [template.textBox];
    const x = Math.min(...boxes.map((box) => box.x));
    const y = Math.min(...boxes.map((box) => box.y));
    return {
      x,
      y,
      width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
      height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
    };
  }
  function backgroundPlacement(template, size) {
    const box = template.backgroundBox;
    const preserve =
      template.backgroundFit === 'canvas' ||
      (template.backgroundFit === 'auto' &&
        size &&
        Math.abs(size.width / size.height - 16 / 9) < 0.02);
    return preserve
      ? {
          x: box.x - template.canvasAnchor.x,
          y: box.y - template.canvasAnchor.y,
          width: 1920,
          height: 1080,
        }
      : box;
  }
  function captionTransition(appearance) {
    const effect = appearance.motion ? 'mix' : 'cut';
    const transition = appearance.transition;
    const duration = transition?.duration ?? 220;
    return {
      enter: transition?.enter ?? effect,
      exit: transition?.exit ?? effect,
      enterDuration: transition?.enterDuration ?? duration,
      exitDuration: transition?.exitDuration ?? duration,
    };
  }

  function animateTransition(element, effect, entering, duration, current) {
    if (effect === 'cut') return null;
    const shown = { opacity: 1, clipPath: 'inset(0 0 0 0)' };
    const hidden = { ...shown };
    if (effect === 'mix') hidden.opacity = 0;
    else {
      const clipRight = (effect === 'wipe-left-to-right') === entering;
      hidden.clipPath = clipRight ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    }
    return element.animate([current || (entering ? hidden : shown), entering ? shown : hidden], {
      duration,
      easing: 'ease-in-out',
      fill: 'both',
    });
  }

  function setCaptionText(element, text, separateLatin) {
    if (!separateLatin) {
      element.textContent = text;
      return;
    }
    const fragments = text.split(/([\p{Script=Latin}\p{Mark}0-9\u0020-\u007e]+)/u);
    element.replaceChildren(
      ...fragments.map((value, index) => {
        if (index % 2 === 0) return value;
        const span = element.ownerDocument.createElement('span');
        span.className = 'caption-latin';
        span.textContent = value;
        return span;
      }),
    );
  }

  const api = {
    lines,
    importLyrics,
    readLyrics,
    forProgram,
    layoutTemplate,
    bounds,
    backgroundPlacement,
    captionTransition,
    animateTransition,
    setCaptionText,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageCaptions = api;
})(globalThis);
