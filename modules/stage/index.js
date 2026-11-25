'use strict';
const { templates } = require('./templates');
const { format: motionFormat, parseMotionTemplate } = require('../../core/motion-template');
const { lines, forProgram } = require('./captions');
const promotionLayout = require('./promotion-layout');
const {
  text,
  keys,
  id,
  webMedia,
  integer,
  uniqueList,
  round,
  captionTemplate,
  promotion,
} = require('./show');
const types = ['歌唱', '舞蹈', '武术', '器乐', '戏曲', '其他'];
const layerNames = ['channel', 'event', 'lower', 'caption'];
const own = (object, key) => Object.hasOwn(object, key);
function number(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw Error('数值超出范围');
  return value;
}
function program(value) {
  keys(value, [
    'id',
    'type',
    'title',
    'subtitle',
    'performer',
    'caption',
    'roundId',
    'announcementAsset',
    'sloganAsset',
    'sloganText',
    'captionTemplateId',
  ]);
  if (!types.includes(value.type)) throw Error('节目类型无效');
  const caption = text(value.caption || '', 30000);
  if (lines(caption).length > 500) throw Error('每个节目最多保存 500 句字幕');
  return {
    id: id(value.id),
    type: value.type,
    title: text(value.title, 100),
    subtitle: text(value.subtitle || '', 160),
    performer: text(value.performer || '', 160),
    caption,
    roundId: id(value.roundId || '', true),
    announcementAsset: webMedia(value.announcementAsset || '', true),
    captionTemplateId: id(value.captionTemplateId || '', true),
  };
}
function savedCaption(value) {
  keys(value, ['programId', 'caption', 'index', 'template']);
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
  return {
    programId,
    caption,
    index: value.index,
    template: value.template ? captionTemplate(value.template) : null,
  };
}
function createStageModule() {
  function defaults() {
    return {
      version: 2,
      eventName: '',
      channelName: '',
      channelAsset: '',
      eventAsset: '',
      templateId: 'gala',
      motionLower: null,
      motionLowerEnabled: false,
      programs: [],
      rounds: [],
      captionTemplates: [],
      captionTemplateId: '',
      promotions: [],
      promotionRoundId: null,
      live: null,
      captionLive: null,
      layers: Object.fromEntries(layerNames.map((key) => [key, false])),
      style: {
        accent: '',
        background: '',
        foreground: '',
        font: 'template',
        fontAsset: '',
        fontSize: 48,
        lowerX: 96,
        lowerY: 792,
        lowerWidth: 1240,
        channelX: 96,
        channelY: 62,
        eventX: 1392,
        eventY: 792,
        captionX: 96,
        captionY: 958,
        ...promotionLayout.defaults,
        logoSize: 160,
        channelWidth: 160,
        channelHeight: 160,
        eventWidth: 456,
        eventHeight: 240,
        transitionMs: 900,
        motion: true,
      },
      transition: { cue: 0, at: 0, duration: 900, asset: '' },
      vmix: {
        port: 8088,
        input: '',
        titleField: 'Headline.Text',
        subtitleField: 'Description.Text',
        captionField: 'Headline.Text',
        captionMode: false,
        animation: '',
        overlay: 1,
      },
    };
  }
  function reduce(current, patch) {
    keys(patch, [
      'eventName',
      'channelName',
      'channelAsset',
      'eventAsset',
      'templateId',
      'motionLowerImport',
      'motionLowerEnabled',
      'programs',
      'rounds',
      'captionTemplates',
      'captionTemplateId',
      'promotions',
      'promotionRoundId',
      'layers',
      'style',
      'vmix',
    ]);
    const next = { ...current };
    for (const key of ['eventName', 'channelName'])
      if (own(patch, key)) next[key] = text(patch[key], 120);
    if (own(patch, 'channelAsset')) next.channelAsset = webMedia(patch.channelAsset);
    if (own(patch, 'eventAsset')) next.eventAsset = webMedia(patch.eventAsset);
    if (own(patch, 'templateId')) {
      if (!templates.some((item) => item.id === patch.templateId)) throw Error('模板不存在');
      next.templateId = patch.templateId;
    }
    if (own(patch, 'motionLowerImport')) {
      const motion = parseMotionTemplate(patch.motionLowerImport, 'stage');
      next.motionLower = { ...motion, revision: (current.motionLower?.revision || 0) + 1 };
      next.motionLowerEnabled = true;
    }
    if (own(patch, 'motionLowerEnabled')) {
      if (
        typeof patch.motionLowerEnabled !== 'boolean' ||
        (patch.motionLowerEnabled && !next.motionLower)
      )
        throw Error('请先导入动效模板');
      next.motionLowerEnabled = patch.motionLowerEnabled;
    }
    if (own(patch, 'programs')) {
      next.programs = uniqueList(patch.programs, 300, program);
    }
    if (own(patch, 'rounds')) next.rounds = uniqueList(patch.rounds, 100, round);
    if (own(patch, 'captionTemplates'))
      next.captionTemplates = uniqueList(patch.captionTemplates, 100, captionTemplate);
    if (own(patch, 'captionTemplateId')) next.captionTemplateId = id(patch.captionTemplateId, true);
    if (own(patch, 'promotions')) next.promotions = uniqueList(patch.promotions, 101, promotion);
    if (own(patch, 'promotionRoundId') && patch.promotionRoundId !== null) {
      next.promotionRoundId = id(patch.promotionRoundId, true);
      if (!next.promotions.some(({ id }) => id === next.promotionRoundId))
        throw Error('找不到已保存的晋级轮次');
    } else if (!next.promotions.some(({ id }) => id === next.promotionRoundId)) {
      next.promotionRoundId = next.promotions[0]?.id ?? null;
    }
    const rounds = new Set(next.rounds.map((item) => item.id));
    const lyrics = new Set(next.captionTemplates.map((item) => item.id));
    if (
      [...next.programs, ...next.promotions.map(({ id }) => ({ roundId: id }))].some(
        ({ roundId }) => roundId && !rounds.has(roundId),
      )
    )
      throw Error('找不到节目轮次');
    if (
      [next.captionTemplateId, ...next.programs.map((item) => item.captionTemplateId)].some(
        (templateId) => templateId && !lyrics.has(templateId),
      )
    )
      throw Error('找不到歌词模板');
    if (own(patch, 'layers')) {
      keys(patch.layers, layerNames);
      for (const value of Object.values(patch.layers))
        if (typeof value !== 'boolean') throw Error('图层开关无效');
      next.layers = { ...current.layers, ...patch.layers, lower: false };
    }
    if (own(patch, 'style')) {
      keys(patch.style, Object.keys(defaults().style));
      const style = { ...current.style, ...patch.style };
      for (const key of ['accent', 'background', 'foreground'])
        if (style[key] !== '' && !/^#[\da-f]{6}$/i.test(style[key]))
          throw Error('颜色须为六位十六进制值');
      style.font = text(style.font, 120);
      if (!style.font || /[\u0000-\u001f]/.test(style.font)) throw Error('字体无效');
      style.fontAsset = text(style.fontAsset, 100);
      if (style.fontAsset && !/^[a-f0-9]{32}\.(ttf|otf|woff2?)$/i.test(style.fontAsset))
        throw Error('字体文件无效');
      number(style.fontSize, 24, 80);
      number(style.logoSize, Number.MIN_VALUE, Infinity);
      if (own(patch.style, 'logoSize')) {
        const legacySize = {
          channelWidth: style.logoSize,
          channelHeight: style.logoSize,
          eventWidth: style.logoSize * 2.85,
          eventHeight: style.logoSize * 1.5,
        };
        for (const [key, size] of Object.entries(legacySize)) {
          if (!own(patch.style, key)) style[key] = Math.min(Number.MAX_VALUE, size);
        }
      }
      for (const key of ['channelWidth', 'channelHeight', 'eventWidth', 'eventHeight'])
        number(style[key], Number.MIN_VALUE, Infinity);
      number(style.lowerWidth, Number.MIN_VALUE, Infinity);
      number(style.lowerX, 0, 1520);
      number(style.lowerY, 0, 900);
      for (const prefix of ['channel', 'event']) {
        number(style[prefix + 'X'], 0, 1620);
        number(style[prefix + 'Y'], 0, 880);
      }
      number(style.captionX, 0, 1620);
      number(style.captionY, 0, 1020);
      for (const prefix of ['promotionList', 'promotionBackground']) {
        integer(style[prefix + 'X'], -1920, 1920);
        integer(style[prefix + 'Y'], -1080, 1080);
        number(style[prefix + 'Width'], Number.MIN_VALUE, Infinity);
        number(style[prefix + 'Height'], Number.MIN_VALUE, Infinity);
      }
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
      for (const field of ['input', 'titleField', 'subtitleField', 'captionField', 'animation'])
        v[field] = text(v[field], 200);
      if (typeof v.captionMode !== 'boolean' || (v.captionMode && (!v.input || !v.captionField)))
        throw Error('启用 GT 字幕时，请填写 GT 输入和字幕字段');
    }
    if (own(patch, 'captionTemplateId') && next.layers.caption && next.captionLive) {
      const activeProgram = next.programs.find((item) => item.id === next.captionLive.programId);
      next.captionLive = { ...next.captionLive, template: forProgram(next, activeProgram) };
    }
    return next;
  }
  function command(id, label, action) {
    return { id, label, execute: () => ({}), action };
  }
  function cueTransition(state, now, file, duration) {
    return { cue: state.transition.cue + 1, at: now, duration, asset: file };
  }
  function takeProgram(state, item, now) {
    const transition = item.announcementAsset
      ? cueTransition(state, now, item.announcementAsset, 0)
      : state.transition.at
        ? cueTransition(state, 0, '', 0)
        : state.transition;
    return {
      ...state,
      live: { ...item },
      transition,
      layers: {
        ...state.layers,
        lower: false,
        caption: false,
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
    const template = forProgram(state, item);
    return {
      ...state,
      captionLive: { programId: item.id, caption: item.caption, index, template: template || null },
      layers: { ...state.layers, caption: true, lower: false },
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
    command('program.take', '播出报幕', (state, payload, now) => {
      keys(payload, ['id']);
      const item = state.programs.find((entry) => entry.id === payload.id);
      if (!item || !item.title) throw Error('请选择有标题的节目');
      return takeProgram(state, item, now);
    }),
    command('program.next', '下一个节目', (state, payload, now) => {
      keys(payload, ['roundId']);
      const roundId = payload.roundId ?? state.live?.roundId ?? '';
      if (roundId && !state.rounds.some((entry) => entry.id === roundId))
        throw Error('找不到节目轮次');
      const programs = state.programs.filter((item) => item.roundId === roundId);
      const index = programs.findIndex((item) => item.id === state.live?.id);
      const next = programs[index + 1];
      if (!next || !next.title) throw Error('没有下一个节目');
      return takeProgram(state, next, now);
    }),
    command('announcement.play', '重播节目报幕', (state, payload, now) => {
      keys(payload, []);
      if (!state.live?.announcementAsset) throw Error('当前节目未绑定报幕动画');
      return { ...state, transition: cueTransition(state, now, state.live.announcementAsset, 0) };
    }),
    command('caption.take', '播出指定字幕', (state, payload) => {
      keys(payload, ['programId', 'index']);
      return takeCaption(state, findProgram(state, payload.programId), payload.index);
    }),
    command('caption.next', '下一句字幕', (state, payload) => moveCaption(state, payload, 1)),
    command('caption.previous', '上一句字幕', (state, payload) => moveCaption(state, payload, -1)),
    command('caption.hide', '字幕下屏', (state, payload) => {
      keys(payload, []);
      return { ...state, layers: { ...state.layers, caption: false, lower: false } };
    }),
    command('all.hide', '全部下屏', (state) => ({
      ...state,
      layers: Object.fromEntries(layerNames.map((key) => [key, false])),
      transition: cueTransition(state, 0, '', 0),
    })),
    command('transition.play', '播放包装转场', (state, payload, now) => ({
      ...state,
      transition: state.live?.announcementAsset
        ? cueTransition(state, now, state.live.announcementAsset, 0)
        : cueTransition(state, now, '', state.style.transitionMs),
    })),
  ];
  // Commands use a private reducer envelope so clients cannot set live snapshots/cues.
  const module = {
    id: 'stage',
    name: '舞台节目',
    capabilities: [
      'rundown',
      'rounds',
      'templates',
      'caption-templates',
      'logos',
      'lower-third',
      'captions',
      'caption-cues',
      'transition',
      'promotion',
      'asset-library',
      'vmix-gt',
    ],
    migrate(saved) {
      const base = defaults();
      if (Object.keys(saved).length === 0) return base;
      const {
        version,
        live,
        transition,
        transitionAsset,
        captionLive,
        motionLower,
        motionLowerEnabled,
        promotionLive,
        sloganLive,
        sponsorAsset,
        sponsorName,
        ...editable
      } = saved;
      if (version !== 2) {
        const { sponsor, slogan, ...layers } = editable.layers || {};
        const { sponsorX, sponsorY, ...style } = editable.style || {};
        const legacy =
          sloganLive?.asset ||
          live?.sloganAsset ||
          editable.programs?.find((item) => item.sloganAsset)?.sloganAsset;
        if (legacy && (slogan || !editable.eventAsset)) {
          editable.eventAsset = legacy;
          style.eventX = base.style.eventX;
          style.eventY = base.style.eventY;
        } else if (!editable.eventAsset && sponsorAsset) {
          editable.eventAsset = sponsorAsset;
          style.eventX = sponsorX ?? base.style.eventX;
          style.eventY = sponsorY ?? base.style.eventY;
        }
        if (!editable.eventName)
          editable.eventName = sloganLive?.text || live?.sloganText || sponsorName || '';
        editable.layers = { ...layers, event: Boolean(layers.event || sponsor || slogan) };
        editable.style = style;
      }
      const state = reduce(base, editable);
      if (motionLower) {
        state.motionLower = {
          ...parseMotionTemplate(
            {
              format: motionFormat,
              version: 2,
              module: 'stage',
              slot: 'program',
              id: motionLower.id,
              name: motionLower.name,
              scene: {
                width: motionLower.width,
                height: motionLower.height,
                position: motionLower.position,
              },
              elements: motionLower.elements,
              motion: { enter: motionLower.enter, exit: motionLower.exit },
            },
            'stage',
          ),
          revision: Number.isSafeInteger(motionLower.revision) ? motionLower.revision : 1,
        };
        state.motionLowerEnabled = motionLowerEnabled === true;
      }
      if (live != null) state.live = program(live);
      if (
        !own(saved, 'promotionRoundId') &&
        state.promotions.some(({ id }) => id === promotionLive?.id)
      )
        state.promotionRoundId = promotionLive.id;
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
      promotionRoundId: state.promotionRoundId,
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
