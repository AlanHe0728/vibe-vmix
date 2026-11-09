'use strict';
// These presets change only the audience graphics, never the operator's UI.
const templates = [
  {
    id: 'gala',
    name: '典礼 · 朱金',
    description: '晚会、庆典、民族歌舞',
    accent: '#d5b66e',
    background: '#721d2b',
    foreground: '#fff9e9',
    font: 'serif',
    shape: 'classic',
  },
  {
    id: 'concert',
    name: '现场 · 冰蓝',
    description: '流行演唱、乐队、现代舞',
    accent: '#89d8ff',
    background: '#122b46',
    foreground: '#ffffff',
    font: 'sans-serif',
    shape: 'split',
  },
  {
    id: 'ink',
    name: '风骨 · 水墨',
    description: '武术、戏曲、传统器乐',
    accent: '#9e362c',
    background: '#eee7d8',
    foreground: '#252b28',
    font: 'serif',
    shape: 'ink',
  },
  {
    id: 'minimal',
    name: '留白 · 森绿',
    description: '舞蹈、校园演出、综合节目',
    accent: '#a6d8bf',
    background: '#203c36',
    foreground: '#ffffff',
    font: 'sans-serif',
    shape: 'minimal',
  },
];
module.exports = { templates };
