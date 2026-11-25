'use strict';

const { AppError } = require('../../core/errors');
const { format: motionFormat, parseMotionTemplate } = require('../../core/motion-template');

function invalid(field) {
  throw new AppError('足球模板格式有误：' + field);
}

function label(value, limit, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) invalid(field);
  return value.trim();
}

function color(value, field) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid(field);
  return value;
}

function number(value, min, max, field) {
  if (!Number.isFinite(value) || value < min || value > max) invalid(field);
  return value;
}

function image(value, field) {
  if (value === undefined) return '';
  if (
    typeof value !== 'string' || value.length > 450000 ||
    !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) invalid(field + '（需为 PNG）');
  return value;
}

function font(value) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N} -]{1,64}$/u.test(value)) invalid('字体');
  return value;
}

function point(value) {
  return {
    x: number(value?.x, 0, 1920, '横向位置'),
    y: number(value?.y, 0, 1080, '纵向位置'),
  };
}

function parseFixtures(fixtures) {
  if (fixtures === undefined) return [];
  if (!Array.isArray(fixtures) || fixtures.length > 100) invalid('比赛预设');
  return fixtures.map((fixture) => ({
    title: label(fixture?.title, 80, '比赛场次'),
    home: label(fixture?.home, 60, '主队名称'),
    away: label(fixture?.away, 60, '客队名称'),
    homeColor: color(fixture?.homeColor, '主队颜色'),
    awayColor: color(fixture?.awayColor, '客队颜色'),
  }));
}

function identity({ id, name }) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id) ||
      ['classic', 'constructor', 'prototype'].includes(id)) invalid('模板标识');
  return { id, name: label(name, 64, '模板名称') };
}

function parseScoreboardTemplate(input) {
  if (input?.format !== 'vibe-vmix-scoreboard' || input.version !== 1 || input.layout !== 'two-row')
    invalid('仅支持第 1 版双排比分牌模板');
  const { position, dimensions, theme, images, fixtures } = input;
  return {
    ...identity(input),
    position: point(position),
    dimensions: {
      brandWidth: number(dimensions?.brandWidth, 100, 600, '标志区宽度'),
      teamWidth: number(dimensions?.teamWidth, 200, 800, '队名区宽度'),
      scoreWidth: number(dimensions?.scoreWidth, 65, 350, '比分区宽度'),
      rowHeight: number(dimensions?.rowHeight, 60, 270, '行高'),
      gutter: number(dimensions?.gutter, 0, 40, '列间距'),
    },
    theme: {
      brand: color(theme?.brand, '标志区底色'),
      clock: color(theme?.clock, '计时区底色'),
      clockInk: color(theme?.clockInk, '计时文字颜色'),
      font: theme.font === undefined ? 'Microsoft YaHei' : font(theme.font),
    },
    images: { left: image(images?.left, '左标志'), right: image(images?.right, '右标志') },
    fixtures: parseFixtures(fixtures),
  };
}

const layers = ['sb', 'clk', 'rst', 'card', 'ply', 'goal', 'sub', 'logo', 'lineup', 'lineup_all'];
const labels = [
  'goal', 'substitution', 'subOff', 'subOn', 'player', 'redCard', 'yellowCard',
  'kickoff', 'throwin', 'corner', 'goalkick', 'freekick', 'penalty',
  'clockUp', 'clockDown', 'clockTitle', 'clockCaption', 'lineup', 'starters', 'substitutes',
];
const colors = ['surface', 'secondary', 'ink', 'muted', 'line', 'heading', 'headingInk', 'accent'];

function record(value, field) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value;
}

function style(input) {
  const data = record(input, '样式');
  const result = {};
  for (const key of colors) if (Object.hasOwn(data, key)) result[key] = color(data[key], key);
  if (data.font !== undefined) result.font = font(data.font);
  if (data.radius !== undefined) result.radius = number(data.radius, 0, 32, '圆角');
  return result;
}

function parsePresentation(input) {
  const labelData = record(input.labels, '包装文案');
  const layerData = record(input.layers, '图层');
  const presentation = {
    style: style(input.style),
    labels: Object.fromEntries(labels.filter((key) => Object.hasOwn(labelData, key))
      .map((key) => [key, label(labelData[key], 40, key)])),
    layers: {},
    logo: image(input.logo, '赛事标志'),
  };
  for (const key of layers) {
    if (!Object.hasOwn(layerData, key)) continue;
    const layer = record(layerData[key], key);
    presentation.layers[key] = {
      style: style(layer.style),
      ...(layer.position === undefined ? {} : { position: point(layer.position) }),
      ...(layer.scale === undefined ? {} : { scale: number(layer.scale, 0.3, 3, '图层缩放') }),
    };
  }
  return presentation;
}

function parseFootballTemplate(input) {
  if (input?.format === motionFormat) {
    const motion = parseMotionTemplate(input, 'football');
    return {
      id: motion.id, name: motion.name, position: motion.position,
      motion, fixtures: parseFixtures(input.fixtures),
      ...(input.presentation === undefined ? {} : {
        presentation: parsePresentation(record(input.presentation, '足球全局样式')),
      }),
    };
  }
  if (input?.format === 'vibe-vmix-scoreboard') return parseScoreboardTemplate(input);
  if (input?.format !== 'vibe-vmix-football' || input.version !== 1)
    invalid('仅支持第 1 版足球包装模板');
  const meta = identity(input);
  const board = record(input.scoreboard, '比分条');
  const presentation = parsePresentation(input);
  const scoreboard = input.scoreboard === undefined ? {} : parseScoreboardTemplate({
    ...board, ...meta, format: 'vibe-vmix-scoreboard', version: 1,
  });
  return { ...scoreboard, ...meta, presentation, fixtures: parseFixtures(input.fixtures) };
}

function layoutPrefix(template, layer) {
  if (layer === 'sb' && (template?.dimensions || template?.motion)) return 'sb_template_' + template.id;
  return template?.presentation ? 'pack_template_' + template.id + '_' + layer : layer;
}

module.exports = { parseFootballTemplate, layoutPrefix };
