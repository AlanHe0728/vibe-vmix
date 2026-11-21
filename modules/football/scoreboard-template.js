'use strict';

const { AppError } = require('../../core/errors');

function invalid(field) {
  throw new AppError('比分牌模板格式有误：' + field);
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

function parseScoreboardTemplate(input) {
  if (input?.format !== 'vibe-vmix-scoreboard' || input.version !== 1 || input.layout !== 'two-row')
    invalid('仅支持第 1 版双排比分牌模板');
  const { id, name, position, dimensions, theme, images, fixtures } = input;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id) ||
      ['classic', 'constructor', 'prototype'].includes(id)) invalid('模板标识');
  if (theme?.font !== undefined &&
      (typeof theme.font !== 'string' || !/^[\p{L}\p{N} -]{1,64}$/u.test(theme.font))) invalid('字体');
  if (fixtures !== undefined && (!Array.isArray(fixtures) || fixtures.length > 100)) invalid('比赛预设');
  return {
    id,
    name: label(name, 64, '模板名称'),
    position: {
      x: number(position?.x, 0, 1920, '横向位置'),
      y: number(position?.y, 0, 1080, '纵向位置'),
    },
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
      font: theme.font || 'Microsoft YaHei',
    },
    images: Object.fromEntries(['left', 'right', 'headerLeft', 'headerRight'].map(
      (key) => [key, image(images?.[key], key)],
    )),
    fixtures: (fixtures || []).map((fixture) => ({
      title: label(fixture?.title, 80, '比赛场次'),
      home: label(fixture?.home, 60, '主队名称'),
      away: label(fixture?.away, 60, '客队名称'),
      homeColor: color(fixture?.homeColor, '主队颜色'),
      awayColor: color(fixture?.awayColor, '客队颜色'),
    })),
  };
}

module.exports = { parseScoreboardTemplate };
