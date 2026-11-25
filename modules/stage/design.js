'use strict';

const { AppError } = require('../../core/errors');
const { format, parseMotionTemplate } = require('../../core/motion-template');

const fields = {
  caption: ['caption.text'],
  promotion: [
    'promotion.title',
    'promotion.page',
    'promotion.rank',
    'promotion.name',
    'promotion.program',
    'promotion.score',
  ],
};
const rosterFields = fields.promotion.slice(2);
const mediaPrefix = '/stage-design-media/';
const mediaName = /^[a-f0-9]{64}\.(?:png|webm)$/;
const byteLimit = 4 * 1024 * 1024;
const staticTrack = (opacity) => ({
  duration: 1,
  frames: [
    { t: 0, x: 0, y: 0, opacity: 1 },
    { t: 1, x: 0, y: 0, opacity },
  ],
});
const defaultMotion = { enter: staticTrack(1), exit: staticTrack(0) };

function invalid(message) {
  throw new AppError('舞台设计模板：' + message, 400, 'INVALID_STAGE_DESIGN');
}

function metric(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) invalid(name + '超出范围');
  return value;
}

function storedAsset(src, type) {
  const suffix = type === 'image' ? '.png' : '.webm';
  if (
    typeof src !== 'string' ||
    !src.startsWith(mediaPrefix) ||
    !src.endsWith(suffix) ||
    !mediaName.test(src.slice(mediaPrefix.length))
  )
    invalid('素材地址无效');
  return src;
}

function rosterLayout(input, elements, width, height) {
  const cells = elements.filter(({ bind }) => rosterFields.includes(bind));
  const cellTop = Math.min(...cells.map(({ y }) => y));
  const cellBottom = Math.max(...cells.map(({ y, height }) => y + height));
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
    invalid('roster 须为对象');
  const row = input ?? {};
  if (
    Object.keys(row).some(
      (key) =>
        !['top', 'rowHeight', 'bottom', 'gap', 'minColumnWidth', 'headings', 'repeatArt'].includes(
          key,
        ),
    )
  )
    invalid('未知首行配置项');
  if (
    row.repeatArt &&
    !elements.some(
      (item) =>
        item.type === 'image' &&
        !item.bind &&
        item.x === 0 &&
        item.y === 0 &&
        item.width === width &&
        item.height === height,
    )
  )
    invalid('首行底纹需要同尺寸的整幅 PNG 元素');
  const top = metric(row.top ?? cellTop, 0, height, '名单首行 Y');
  const rowHeight = metric(
    row.rowHeight ?? Math.min(height - top, Math.max(28, cellBottom - top + 8)),
    1,
    height - top,
    '行高',
  );
  if (cellTop < top || cellBottom > top + rowHeight) invalid('所有选手字段须位于首行范围内');
  for (const key of ['headings', 'repeatArt'])
    if (row[key] !== undefined && typeof row[key] !== 'boolean') invalid(key + ' 须为布尔值');
  return {
    top,
    rowHeight,
    bottom: metric(row.bottom ?? 24, 0, height, '名单底部留白'),
    gap: metric(row.gap ?? 40, 0, width, '分栏间距'),
    minColumnWidth: metric(row.minColumnWidth ?? Math.min(640, width), 1, 1920, '最小栏宽'),
    headings: row.headings ?? true,
    repeatArt: row.repeatArt ?? false,
  };
}

function stageDesign(value, stored = false) {
  const slot = value?.slot;
  if (typeof slot !== 'string' || !Object.hasOwn(fields, slot))
    invalid('slot 须为 caption 或 promotion');
  if (slot === 'caption' && value.roster !== undefined) invalid('字幕模板不使用名单配置');
  const parsed = parseMotionTemplate({ ...value, motion: value.motion ?? defaultMotion }, 'stage', {
    slot,
    fields: fields[slot],
    ...(stored && { asset: storedAsset }),
  });
  const { id, name, width, height, position, enter, exit } = parsed;
  const seen = new Set();
  const elements = parsed.elements.map((element, index) => {
    const original = value.elements[index];
    const { bind, type } = element;
    if (bind) {
      if (seen.has(bind)) invalid('字段重复：' + bind);
      seen.add(bind);
    }
    const extra = {};
    if (original.opacity !== undefined)
      extra.opacity = metric(original.opacity, 0, 1, '元素透明度');
    if (type === 'image' || type === 'video') {
      if (original.fit !== undefined) {
        if (!['contain', 'cover', 'fill'].includes(original.fit)) invalid('素材适配方式无效');
        extra.fit = original.fit;
      }
    }
    if (type === 'text') {
      if (original.latinFont !== undefined) {
        if (
          typeof original.latinFont !== 'string' ||
          !/^[\p{L}\p{N} -]{1,64}$/u.test(original.latinFont)
        )
          invalid('英文及数字字体无效');
        extra.latinFont = original.latinFont;
      }
      if (original.wrap !== undefined) {
        if (typeof original.wrap !== 'boolean') invalid('wrap 须为布尔值');
        extra.wrap = original.wrap;
      }
    }
    return { ...element, ...extra };
  });
  const required = slot === 'caption' ? ['caption.text'] : ['promotion.title', 'promotion.name'];
  for (const binding of required) {
    if (!seen.has(binding)) invalid('缺少实时文字字段 ' + binding);
  }
  const result = {
    format,
    version: 2,
    module: 'stage',
    slot,
    id,
    name,
    scene: { width, height, position },
    elements,
    motion: { enter, exit },
    ...(slot === 'promotion' && { roster: rosterLayout(value.roster, elements, width, height) }),
  };
  if (stored) result.revision = metric(value.revision, 1, Number.MAX_SAFE_INTEGER, '修订号');
  return result;
}

function captionLink(design, current) {
  const { width, height, position } = design.scene;
  const text = design.elements.find(({ bind }) => bind === 'caption.text');
  const origin = { x: Math.round(position.x), y: Math.round(position.y) };
  return {
    id: design.id,
    designId: design.id,
    name: design.name,
    position: current?.position ?? origin,
    canvasAnchor: origin,
    background: '',
    backgroundFit: 'box',
    backgroundBox: { x: 0, y: 0, width: Math.round(width), height: Math.round(height) },
    textBox: {
      x: Math.round(text.x),
      y: Math.round(text.y),
      width: Math.round(text.width),
      height: Math.round(text.height),
    },
  };
}

module.exports = { stageDesign, captionLink, mediaName, mediaPrefix, byteLimit };
