'use strict';

const { assertObject } = require('../../core/state-store');

const promotionColumns = ['rank', 'name', 'title', 'score'];

function text(value, max = 200) {
  if (typeof value !== 'string' || value.length > max) throw Error('文字过长或格式无效');
  return value.trim();
}

function keys(value, allowed) {
  assertObject(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw Error('未知的舞台设置项');
}

function id(value, empty = false) {
  if (empty && value === '') return '';
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw Error('编号无效');
  return value;
}

function asset(value) {
  value = text(value, 100);
  if (
    value &&
    !/^[a-f0-9]{32}\.(?:png|jpe?g|webp|webm|mp4|mov|avi|alpha\.mp4|frames\.json)$/i.test(value)
  )
    throw Error('素材引用无效');
  return value;
}

function webMedia(value, videoOnly = false) {
  const file = asset(value);
  const motion = /\.(webm|mp4|mov|frames\.json)$/i.test(file);
  if (file && !motion && (videoOnly || !/\.(png|jpe?g|webp)$/i.test(file)))
    throw Error('请选择可用于网页输出的素材');
  return file;
}

function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw Error('数值超出范围');
  return value;
}

function uniqueList(value, limit, normalize) {
  if (!Array.isArray(value) || value.length > limit) throw Error(`最多保存 ${limit} 条`);
  const list = value.map(normalize);
  if (new Set(list.map((entry) => entry.id)).size !== list.length) throw Error('编号重复');
  return list;
}

function round(value) {
  keys(value, ['id', 'name']);
  const name = text(value.name, 80);
  if (!name) throw Error('请填写轮次名称');
  return { id: id(value.id), name };
}

function captionTemplate(value) {
  keys(value, [
    'id',
    'name',
    'background',
    'x',
    'y',
    'width',
    'position',
    'backgroundBox',
    'textBox',
    'backgroundFit',
    'canvasAnchor',
    'appearance',
  ]);
  const name = text(value.name, 80);
  if (!name) throw Error('请填写歌词模板名称');
  const background = webMedia(value.background || '');
  const legacy = !Object.hasOwn(value, 'textBox');
  const position = legacy
    ? { x: background ? 0 : value.x, y: background ? 0 : value.y }
    : value.position;
  keys(position, ['x', 'y']);
  const backgroundFit = value.backgroundFit || 'auto';
  if (!['auto', 'canvas', 'box'].includes(backgroundFit)) throw Error('字幕背景适配方式无效');
  const canvasAnchor = value.canvasAnchor || position;
  keys(canvasAnchor, ['x', 'y']);
  function rectangle(input) {
    keys(input, ['x', 'y', 'width', 'height']);
    return {
      x: integer(input.x, -16000, 16000),
      y: integer(input.y, -16000, 16000),
      width: integer(input.width, 1, 16000),
      height: integer(input.height, 1, 16000),
    };
  }
  return {
    id: id(value.id),
    name,
    background,
    backgroundFit,
    canvasAnchor: {
      x: integer(canvasAnchor.x, -1920, 1920),
      y: integer(canvasAnchor.y, -1080, 1080),
    },
    ...(value.appearance && { appearance: captionAppearance(value.appearance) }),
    position: { x: integer(position.x, -1920, 1920), y: integer(position.y, -1080, 1080) },
    backgroundBox: rectangle(
      legacy ? { x: 0, y: 0, width: 1920, height: 1080 } : value.backgroundBox,
    ),
    textBox: rectangle(
      legacy
        ? {
            x: background ? value.x : 0,
            y: background ? value.y : 0,
            width: value.width,
            height: 160,
          }
        : value.textBox,
    ),
  };
}

function captionAppearance(value) {
  keys(value, [
    'accent',
    'background',
    'foreground',
    'font',
    'fontAsset',
    'latinFont',
    'latinFontAsset',
    'fontSize',
    'motion',
    'transition',
  ]);
  const result = {};
  for (const key of ['accent', 'background', 'foreground']) {
    const color = text(value[key] || '', 7);
    if (color && !/^#[\da-f]{6}$/i.test(color)) throw Error('颜色须为六位十六进制值');
    result[key] = color;
  }
  const font = text(value.font || 'template', 120);
  const fontAsset = text(value.fontAsset || '', 100);
  const latinFont = text(value.latinFont || '', 120);
  const latinFontAsset = text(value.latinFontAsset || '', 100);
  const isFontFile = (name) => !name || /^[a-f0-9]{32}\.(ttf|otf|woff2?)$/i.test(name);
  if (
    !font ||
    /[\u0000-\u001f]/.test(font + latinFont) ||
    !isFontFile(fontAsset) ||
    !isFontFile(latinFontAsset) ||
    typeof value.motion !== 'boolean'
  )
    throw Error('字幕模板样式无效');
  return {
    ...result,
    font,
    fontAsset,
    ...(latinFont && { latinFont }),
    ...(latinFontAsset && { latinFontAsset }),
    fontSize: integer(value.fontSize, 12, 160),
    motion: value.motion,
    ...(Object.hasOwn(value, 'transition') && { transition: captionTransition(value.transition) }),
  };
}

function captionTransition(value) {
  keys(value, ['enter', 'exit', 'duration', 'enterDuration', 'exitDuration']);
  const effects = ['cut', 'mix', 'wipe-left-to-right', 'wipe-right-to-left'];
  if (!effects.includes(value.enter) || !effects.includes(value.exit))
    throw Error('字幕进出场效果无效');
  return {
    enter: value.enter,
    exit: value.exit,
    enterDuration: integer(value.enterDuration ?? value.duration, 100, 3000),
    exitDuration: integer(value.exitDuration ?? value.duration, 100, 3000),
  };
}

function promotionEntry(value) {
  keys(value, ['id', 'programId', 'name', 'title', 'score', 'rank', 'selected']);
  const name = text(value.name, 160);
  if (!name) throw Error('请填写选手姓名');
  const score = value.score == null || value.score === '' ? null : value.score;
  if (score !== null && (!Number.isFinite(score) || Math.abs(score) > 1e9)) throw Error('分数无效');
  const rank = value.rank == null || value.rank === '' ? null : integer(value.rank, 1, 9999);
  if (typeof value.selected !== 'boolean') throw Error('上屏状态无效');
  return {
    id: id(value.id),
    programId: id(value.programId || '', true),
    name,
    title: text(value.title || '', 160),
    score,
    rank,
    selected: value.selected,
  };
}

function promotion(value) {
  keys(value, ['id', 'title', 'background', 'sort', 'columns', 'entries']);
  keys(value.columns, promotionColumns);
  if (promotionColumns.some((key) => typeof value.columns[key] !== 'boolean'))
    throw Error('名单列设置无效');
  if (!['manual', 'score'].includes(value.sort)) throw Error('名单排序方式无效');
  return {
    id: id(value.id, true),
    title: text(value.title, 120),
    background: webMedia(value.background),
    sort: value.sort,
    columns: value.columns,
    entries: uniqueList(value.entries, 300, promotionEntry),
  };
}

function promotionRows(draft) {
  const entries = draft.entries.filter((entry) => entry.selected);
  if (draft.sort === 'manual')
    return entries.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  let previous = null;
  let rank = null;
  return entries
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .map((entry, index) => {
      if (entry.score !== previous) rank = index + 1;
      previous = entry.score;
      return { ...entry, rank: entry.score === null ? null : rank };
    });
}

function promotionSnapshot(draft) {
  const rows = promotionRows(draft);
  return {
    ...draft,
    entries: rows,
    page: 0,
    backgroundVisible: Boolean(draft.background),
    listVisible: true,
  };
}

module.exports = {
  text,
  keys,
  id,
  asset,
  webMedia,
  integer,
  uniqueList,
  round,
  captionTemplate,
  promotion,
  promotionSnapshot,
};
