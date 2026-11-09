'use strict';
const { templates } = require('./templates');
const { assertObject } = require('../../core/state-store');
const { lines } = require('./captions');
const types = ['歌唱', '舞蹈', '武术', '器乐', '戏曲', '其他'];
const layerNames = ['channel', 'event', 'sponsor', 'lower', 'caption'];
const own = (object, key) => Object.hasOwn(object, key);
function text(value, max = 200) {
  if (typeof value !== 'string' || value.length > max) throw Error('文字过长或格式无效');
  return value.trim();
}
function number(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw Error('数值超出范围');
  return value;
}
function keys(value, allowed) {
  assertObject(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw Error('未知的舞台设置项');
}
function asset(value) {
  value = text(value, 100);
  if (value && !/^[a-f0-9]{32}\.(png|jpe?g|webp|webm|mp4|mov|avi)$/i.test(value))
    throw Error('素材引用无效');
  return value;
}
function program(value) {
  keys(value, ['id', 'type', 'title', 'subtitle', 'performer', 'caption']);
  const id = text(value.id, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !types.includes(value.type))
    throw Error('节目编号或类型无效');
  const caption = text(value.caption || '', 30000);
  if (lines(caption).length > 500) throw Error('每个节目最多保存 500 句字幕');
  return {
    id,
    type: value.type,
    title: text(value.title, 100),
    subtitle: text(value.subtitle || '', 160),
    performer: text(value.performer || '', 160),
    caption,
  };
}
function savedCaption(value) {
  keys(value, ['programId', 'caption', 'index']);
  const programId = text(value.programId, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(programId)) throw Error('字幕节目编号无效');
  const caption = text(value.caption, 30000);
  const entries = lines(caption);
  if (
    entries.length > 500 ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= entries.length
  )
    throw Error('字幕位置无效');
  return { programId, caption, index: value.index };
}
function createStageModule() {
  function defaults() {
    return {
      version: 1,
      eventName: '',
      channelName: '',
      sponsorName: '',
      channelAsset: '',
      eventAsset: '',
      sponsorAsset: '',
      transitionAsset: '',
      templateId: 'gala',
      programs: [],
      live: null,
      captionLive: null,
      layers: Object.fromEntries(layerNames.map((key) => [key, false])),
      style: {
        accent: '',
        background: '',
        foreground: '',
        font: 'template',
        fontSize: 48,
        lowerX: 96,
        lowerY: 792,
        lowerWidth: 1240,
        channelX: 96,
        channelY: 62,
        eventX: 1536,
        eventY: 62,
        sponsorX: 1536,
        sponsorY: 850,
        captionX: 96,
        captionY: 958,
        logoSize: 160,
        transitionMs: 900,
        motion: true,
      },
      transition: { cue: 0, at: 0, duration: 900 },
      vmix: {
        port: 8088,
        input: '',
        titleField: 'Headline.Text',
        subtitleField: 'Description.Text',
        overlay: 1,
      },
    };
  }
  function reduce(current, patch) {
    keys(patch, [
      'eventName',
      'channelName',
      'sponsorName',
      'channelAsset',
      'eventAsset',
      'sponsorAsset',
      'transitionAsset',
      'templateId',
      'programs',
      'layers',
      'style',
      'vmix',
    ]);
    const next = { ...current };
    for (const key of ['eventName', 'channelName', 'sponsorName'])
      if (own(patch, key)) next[key] = text(patch[key], 120);
    for (const key of ['channelAsset', 'eventAsset', 'sponsorAsset', 'transitionAsset'])
      if (own(patch, key)) next[key] = asset(patch[key]);
    if (own(patch, 'templateId')) {
      if (!templates.some((item) => item.id === patch.templateId)) throw Error('模板不存在');
      next.templateId = patch.templateId;
    }
    if (own(patch, 'programs')) {
      if (!Array.isArray(patch.programs) || patch.programs.length > 300)
        throw Error('最多保存 300 个节目');
      next.programs = patch.programs.map(program);
      if (new Set(next.programs.map((item) => item.id)).size !== next.programs.length)
        throw Error('节目编号重复');
    }
    if (own(patch, 'layers')) {
      keys(patch.layers, layerNames);
      for (const value of Object.values(patch.layers))
        if (typeof value !== 'boolean') throw Error('图层开关无效');
      next.layers = { ...current.layers, ...patch.layers };
    }
    if (own(patch, 'style')) {
      keys(patch.style, Object.keys(defaults().style));
      const style = { ...current.style, ...patch.style };
      for (const key of ['accent', 'background', 'foreground'])
        if (style[key] !== '' && !/^#[\da-f]{6}$/i.test(style[key]))
          throw Error('颜色须为六位十六进制值');
      if (!['template', 'serif', 'sans-serif'].includes(style.font)) throw Error('字体无效');
      number(style.fontSize, 24, 80);
      number(style.logoSize, 40, 300);
      number(style.lowerWidth, 400, 1728);
      number(style.lowerX, 0, 1520);
      number(style.lowerY, 0, 900);
      if (style.lowerX + style.lowerWidth > 1920) throw Error('字幕条超出画布宽度');
      for (const prefix of ['channel', 'event', 'sponsor']) {
        number(style[prefix + 'X'], 0, 1620);
        number(style[prefix + 'Y'], 0, 880);
      }
      number(style.captionX, 0, 1620);
      number(style.captionY, 0, 1020);
      number(style.transitionMs, 400, 5000);
      if (typeof style.motion !== 'boolean') throw Error('动画设置无效');
      next.style = style;
    }
    if (own(patch, 'vmix')) {
      keys(patch.vmix, Object.keys(current.vmix));
      next.vmix = { ...current.vmix, ...patch.vmix };
      const v = next.vmix;
      number(v.port, 1, 65535);
      number(v.overlay, 1, 4);
      if (!Number.isInteger(v.port) || !Number.isInteger(v.overlay))
        throw Error('端口和叠加通道须为整数');
      for (const field of ['input', 'titleField', 'subtitleField']) v[field] = text(v[field], 200);
    }
    return next;
  }
  function command(id, label, action) {
    return { id, label, execute: () => ({}), action };
  }
  function takeProgram(state, item) {
    return {
      ...state,
      live: { ...item },
      layers: {
        ...state.layers,
        lower: true,
        caption: state.captionLive?.programId === item.id && state.layers.caption,
      },
    };
  }
  function findProgram(state, id) {
    const item = state.programs.find((entry) => entry.id === id);
    if (!item) throw Error('请先选择已保存的节目');
    return item;
  }
  function takeCaption(state, item, index) {
    const entries = lines(item.caption);
    if (!Number.isInteger(index) || index < 0 || index >= entries.length)
      throw Error('请选择有效的字幕句子');
    return {
      ...state,
      captionLive: { programId: item.id, caption: item.caption, index },
      layers: { ...state.layers, caption: true },
    };
  }
  function moveCaption(state, payload, step) {
    keys(payload, ['programId']);
    const item = findProgram(state, payload.programId);
    if (!lines(item.caption).length) throw Error('请先添加并保存字幕');
    const current = state.captionLive;
    if (!current || current.programId !== item.id) {
      if (step < 0) throw Error('请先播出一句字幕');
      return takeCaption(state, item, 0);
    }
    if (current.caption !== item.caption) throw Error('字幕已修改，请点选一句重新播出');
    const index = current.index + step;
    if (index < 0) throw Error('已经是第一句字幕');
    if (index >= lines(item.caption).length) throw Error('已经是最后一句字幕');
    return takeCaption(state, item, index);
  }
  const actions = [
    command('program.take', '播出节目', (state, payload) => {
      keys(payload, ['id']);
      const item = state.programs.find((entry) => entry.id === payload.id);
      if (!item || !item.title) throw Error('请选择有标题的节目');
      return takeProgram(state, item);
    }),
    command('program.next', '下一个节目', (state) => {
      const index = state.programs.findIndex((item) => item.id === state.live?.id);
      const next = state.programs[index + 1];
      if (!next || !next.title) throw Error('没有下一个节目');
      return takeProgram(state, next);
    }),
    command('caption.take', '播出指定字幕', (state, payload) => {
      keys(payload, ['programId', 'index']);
      return takeCaption(state, findProgram(state, payload.programId), payload.index);
    }),
    command('caption.next', '下一句字幕', (state, payload) => moveCaption(state, payload, 1)),
    command('caption.previous', '上一句字幕', (state, payload) => moveCaption(state, payload, -1)),
    command('caption.hide', '字幕下屏', (state, payload) => {
      keys(payload, []);
      return { ...state, layers: { ...state.layers, caption: false } };
    }),
    command('all.hide', '全部下屏', (state) => ({
      ...state,
      layers: Object.fromEntries(layerNames.map((key) => [key, false])),
    })),
    command('transition.play', '播放包装转场', (state, payload, now) => ({
      ...state,
      transition: { cue: state.transition.cue + 1, at: now, duration: state.style.transitionMs },
    })),
  ];
  // Commands use a private reducer envelope so clients cannot set live snapshots/cues.
  const module = {
    id: 'stage',
    name: '舞台节目',
    capabilities: [
      'rundown',
      'templates',
      'logos',
      'sponsor',
      'lower-third',
      'captions',
      'caption-cues',
      'transition',
      'asset-library',
      'vmix-gt',
    ],
    migrate(saved) {
      const base = defaults();
      if (Object.keys(saved).length === 0) return base;
      const { version, live, transition, captionLive, ...editable } = saved;
      const state = reduce(base, editable);
      if (live != null) state.live = program(live);
      if (captionLive != null) state.captionLive = savedCaption(captionLive);
      else if (
        !own(saved, 'captionLive') &&
        state.layers.caption &&
        lines(state.live?.caption).length
      )
        state.captionLive = { programId: state.live.id, caption: state.live.caption, index: 0 };
      // Never replay a transition after restart.
      return {
        ...state,
        transition: {
          ...base.transition,
          cue: Number.isSafeInteger(transition?.cue) ? transition.cue : 0,
        },
      };
    },
    reduce(current, patch, now) {
      if (Object.hasOwn(patch, '_command')) {
        keys(patch, ['_command', 'payload']);
        const action = actions.find((item) => item.id === patch._command);
        if (!action) throw Error('未知命令');
        return action.action(current, patch.payload, now);
      }
      return reduce(current, patch);
    },
    status: (state) => ({
      live: state.live,
      captionLive: state.captionLive,
      layers: state.layers,
      templateId: state.templateId,
    }),
    commands: actions.map(({ id, label }) => ({
      id,
      label,
      execute: (state, payload) => ({ _command: id, payload }),
    })),
  };
  return module;
}
module.exports = { createStageModule, types };
