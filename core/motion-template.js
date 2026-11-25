'use strict';
const { AppError } = require('./errors');

const format = 'vibe-vmix-graphics';
const fields = {
  football: ['team.home', 'team.away', 'score.home', 'score.away', 'clock.match'],
  stage: ['program.title', 'program.performer', 'program.subtitle', 'program.type', 'event.name'],
};

const logos = {
  football: ['team.homeLogo', 'team.awayLogo', 'event.logo'],
  stage: ['event.logo'],
};

function invalid(field) {
  throw new AppError('动效模板格式有误：' + field);
}

function number(value, min, max, field) {
  if (!Number.isFinite(value) || value < min || value > max) invalid(field);
  return value;
}

function label(value, max, field) {
  if (typeof value !== 'string' || value.length > max || !value.trim()) invalid(field);
  return value;
}

function color(value, field) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(field);
  return value;
}

function teamField(value, module) {
  const key = value ?? '';
  if (key && (module !== 'football' || !['home', 'away'].includes(key))) invalid('队色绑定');
  return key;
}

function asset(value, kind) {
  const signature =
    kind === 'image' ? /^data:image\/png;base64,iVBORw0KGgo/ : /^data:video\/webm;base64,GkXf/;
  if (
    typeof value !== 'string' ||
    value.length > 2500000 ||
    !signature.test(value) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(value.indexOf(',') + 1))
  )
    invalid('内嵌透明素材');
  return value;
}

function track(value, label) {
  if (
    !value ||
    !Array.isArray(value.frames) ||
    value.frames.length < 2 ||
    value.frames.length > 240
  )
    invalid(label + '关键帧');
  const duration = number(value.duration, 1, 10000, label + '时长');
  let last = -1;
  const frames = value.frames.map((point) => {
    const t = number(point?.t, 0, 1, '帧进度');
    if (t <= last) invalid('帧进度须递增');
    last = t;
    return {
      t,
      x: number(point.x, -1920, 1920, '动画横坐标'),
      y: number(point.y, -1080, 1080, '动画纵坐标'),
      sx: number(point.sx ?? 1, 0.05, 4, '动画横向缩放'),
      sy: number(point.sy ?? 1, 0.05, 4, '动画纵向缩放'),
      rotation: number(point.rotation ?? 0, -360, 360, '动画旋转'),
      opacity: number(point.opacity, 0, 1, '动画透明度'),
    };
  });
  if (frames[0].t !== 0 || last !== 1) invalid('关键帧须覆盖完整时段');
  return { duration, frames };
}

function parseMotionTemplate(input, module, options = {}) {
  const slot = options.slot ?? (module === 'football' ? 'scoreboard' : 'program');
  const allowedFields = options.fields ?? fields[module];
  const parseAsset = options.asset ?? asset;
  if (
    input?.format !== format ||
    input.version !== 2 ||
    input.module !== module ||
    input.slot !== slot
  )
    invalid('模板模块或版本');
  const { id, name, scene, elements, motion } = input;
  if (
    typeof id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,47}$/.test(id) ||
    ['classic', 'constructor', 'prototype'].includes(id)
  )
    invalid('模板标识');
  const width = number(scene?.width, 64, 1920, '组件宽度');
  const height = number(scene?.height, 24, 1080, '组件高度');
  if (!Array.isArray(elements) || !elements.length || elements.length > 64) invalid('组件列表');
  return {
    id,
    name: label(name, 64, '模板名'),
    width,
    height,
    position: {
      x: number(scene.position?.x, 0, 1920, '画布横坐标'),
      y: number(scene.position?.y, 0, 1080, '画布纵坐标'),
    },
    elements: elements.map((el) => {
      const box = {
        type: el?.type,
        x: number(el?.x, 0, width, '元素横坐标'),
        y: number(el?.y, 0, height, '元素纵坐标'),
        width: number(el?.width, 1, width, '元素宽度'),
        height: number(el?.height, 1, height, '元素高度'),
      };
      if (box.x + box.width > width || box.y + box.height > height) invalid('元素超出组件范围');
      if (el.type === 'rect') {
        return {
          ...box,
          color: color(el.color, '矩形颜色'),
          colorField: teamField(el.colorField, module),
          radius: number(el.radius ?? 0, 0, 64, '矩形圆角'),
        };
      }
      if (el.type === 'image' && el.bind !== undefined) {
        if (!logos[module]?.includes(el.bind)) invalid('Logo 绑定');
        return { ...box, bind: el.bind, src: el.src ? parseAsset(el.src, 'image') : '' };
      }
      if (el.type === 'image' || el.type === 'video')
        return { ...box, src: parseAsset(el.src, el.type) };
      if (el.type !== 'text') invalid('元素类型');
      const bind = el.bind ?? '';
      if (bind && !allowedFields.includes(bind)) invalid('实时字段');
      const align = el.align ?? 'left';
      if (!['left', 'center', 'right'].includes(align)) invalid('文本对齐');
      const font = el.font ?? 'Microsoft YaHei';
      if (typeof font !== 'string' || !/^[\p{L}\p{N} -]{1,64}$/u.test(font)) invalid('字体');
      return {
        ...box,
        bind,
        align,
        font,
        text: el.text === '' || el.text === undefined ? '' : label(el.text, 160, '文字'),
        fontSize: number(el.fontSize, 8, 144, '字号'),
        weight: number(el.weight ?? 600, 100, 900, '字重'),
        minFontSize: number(el.minFontSize ?? el.fontSize, 8, el.fontSize, '最小字号'),
        color: color(el.color, '文字颜色'),
        inkField: teamField(el.inkField, module),
      };
    }),
    enter: track(motion?.enter, '入场'),
    exit: track(motion?.exit, '退场'),
  };
}

module.exports = { format, parseMotionTemplate };
