'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { deflateSync, crc32 } = require('node:zlib');
const { test } = require('node:test');
const vm = require('node:vm');
const { createStageServer } = require('../server/stage-server');
const { encoder } = require('../server/stage-media');

function setup(t, options) {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-beta5-'));
  const server = createStageServer({ dataDirectory, ...options });
  t.after(() => {
    server.close();
    assert.equal(path.dirname(dataDirectory), path.resolve(os.tmpdir()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  return { server, dataDirectory };
}

function request(server, url, input, headers = {}, method = input === undefined ? 'GET' : 'POST') {
  const body = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input === undefined ? '' : JSON.stringify(input));
  const req = Readable.from(body.length ? [body] : []);
  Object.assign(req, {
    url,
    method,
    headers: { host: '127.0.0.1:8125', 'content-length': body.length, ...headers },
    socket: { localPort: 8125 },
  });
  return new Promise((resolve, reject) => {
    const chunks = [];
    const res = new Writable({
      write(chunk, encoding, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    const outgoing = {};
    let status = 200;
    res.setHeader = (key, value) => {
      outgoing[key.toLowerCase()] = value;
    };
    res.writeHead = (code, values = {}) => {
      status = code;
      res.headersSent = true;
      for (const [key, value] of Object.entries(values)) res.setHeader(key, value);
    };
    res.on('error', reject);
    res.on('finish', () => {
      const bytes = Buffer.concat(chunks);
      resolve({ status, headers: outgoing, bytes, json: () => JSON.parse(bytes) });
    });
    server.emit('request', req, res);
  });
}

const call = (server, command, payload = {}) =>
  request(server, '/api/v1/commands/' + command, payload);
const media = 'a'.repeat(32) + '.alpha.mp4';

test('legacy logo assets consolidate into a global layer that persists across programs', async (t) => {
  const { dataDirectory } = setup(t);
  const { createStageModule } = require('../modules/stage');
  const module = createStageModule();
  const song = {
    id: 'old',
    type: '歌唱',
    title: '节目',
    caption: '一句',
    sloganAsset: media,
    sloganText: '活动',
  };
  const legacy = {
    version: 1,
    sloganLive: { asset: media, text: '活动' },
    sponsorAsset: 'b'.repeat(32) + '.png',
    layers: { slogan: true, sponsor: true, event: false },
    programs: [song],
    style: { sponsorX: 1500, sponsorY: 820 },
  };
  fs.writeFileSync(path.join(dataDirectory, 'state.json'), JSON.stringify(legacy));
  const server = createStageServer({ dataDirectory });
  t.after(() => server.close());
  const migrated = server.workspaceState();
  assert.equal(migrated.eventAsset, media);
  assert.equal(migrated.eventName, '活动');
  assert.equal(migrated.style.eventY, 792);
  assert.equal(migrated.layers.event, true);
  assert.equal(migrated.layers.slogan, undefined);
  assert.equal(migrated.programs[0].sloganAsset, undefined);
  assert.equal((await call(server, 'program.take', { id: 'old' })).status, 200);
  assert.equal(server.workspaceState().eventAsset, media);
  assert.equal(server.workspaceState().layers.event, true);
  assert.equal(module.migrate(server.workspaceState()).eventAsset, media);
});

test('each round takes its own program, alpha cue and lyric template snapshot', async (t) => {
  const { server, dataDirectory } = setup(t);
  const song = {
    id: 'one',
    type: '歌唱',
    title: '第一首',
    performer: '甲',
    caption: '第一句\n第二句',
    roundId: 'r1',
    announcementAsset: media,
    captionTemplateId: 'lyrics',
  };
  const lyrics = { id: 'lyrics', name: '歌词模板', background: media, x: 132, y: 910, width: 1400 };
  const programs = [
    song,
    { ...song, id: 'two', roundId: 'r2', announcementAsset: '' },
    { ...song, id: 'three', title: '第三首' },
  ];
  const setupResponse = await request(server, '/api/v1/state', {
    rounds: [
      { id: 'r1', name: '第一轮' },
      { id: 'r2', name: '第二轮' },
    ],
    captionTemplates: [lyrics],
    programs,
  });
  assert.equal(setupResponse.status, 200, setupResponse.bytes.toString());
  assert.equal((await call(server, 'program.next', { roundId: 'r1' })).status, 200);
  let state = server.workspaceState();
  assert.equal(state.live.id, 'one');
  assert.equal(state.transition.asset, media);
  assert.equal(state.transition.duration, 0);
  assert.equal(state.layers.lower, false);
  assert.equal(state.layers.caption, false);
  assert.equal(state.layers.event, false);
  assert.equal((await call(server, 'caption.take', { programId: 'one', index: 0 })).status, 200);
  assert.equal(server.workspaceState().layers.lower, false);
  assert.equal((await call(server, 'transition.play')).status, 200);
  assert.equal(server.workspaceState().transition.asset, media);
  assert.equal(server.workspaceState().transition.duration, 0);
  const migrated = server.workspaceState().captionLive.template;
  assert.deepEqual(migrated.position, { x: 0, y: 0 });
  assert.deepEqual(migrated.backgroundBox, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(migrated.textBox, { x: 132, y: 910, width: 1400, height: 160 });
  const effect = { enter: 'wipe-right-to-left', exit: 'mix', duration: 600 };
  const migratedEffect = {
    enter: effect.enter,
    exit: effect.exit,
    enterDuration: 600,
    exitDuration: 600,
  };
  const configured = { ...lyrics, appearance: { motion: true, fontSize: 38, transition: effect } };
  const save = (template) => request(server, '/api/v1/state', { captionTemplates: [template] });
  assert.equal((await save(configured)).status, 200);
  assert.deepEqual(
    server.workspaceState().captionTemplates[0].appearance.transition,
    migratedEffect,
  );
  assert.equal(
    (
      await save({
        ...configured,
        appearance: { ...configured.appearance, transition: { ...effect, duration: 0 } },
      })
    ).status,
    400,
  );
  assert.equal((await call(server, 'program.next', { roundId: 'r1' })).status, 200);
  state = server.workspaceState();
  assert.equal(state.live.id, 'three');
  assert.equal(state.layers.caption, false);
  assert.equal((await call(server, 'program.next', { roundId: 'r1' })).status, 400);
  assert.equal((await call(server, 'program.next', { roundId: 'r2' })).status, 200);
  assert.equal(server.workspaceState().live.id, 'two');
  assert.equal(server.workspaceState().transition.at, 0);
  assert.equal((await call(server, 'announcement.play')).status, 400);
  assert.equal((await request(server, '/api/v1/state', { layers: { lower: true } })).status, 200);
  assert.equal(server.workspaceState().layers.lower, false);
  assert.equal((await request(server, '/api/v1/state', { rounds: [] })).status, 400);
  const restarted = createStageServer({ dataDirectory });
  assert.equal(restarted.workspaceState().transition.at, 0);
  assert.equal(restarted.workspaceState().live.id, 'two');
  assert.deepEqual(
    restarted.workspaceState().captionTemplates[0].appearance.transition,
    migratedEffect,
  );
  restarted.close();
});

test('workspace lays out each custom subtitle template as one movable group', async (t) => {
  const { createWorkspaceServer } = require('../server/workspace-server');
  const { bounds } = require('../modules/stage/captions');
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-layout-'));
  const stageDirectory = path.join(dataDirectory, 'stage');
  fs.mkdirSync(stageDirectory);
  const template = {
    id: 'custom',
    name: '超宽背景',
    background: media,
    position: { x: 26, y: 700 },
    backgroundBox: { x: -18, y: 0, width: 2400, height: 160 },
    textBox: { x: 36, y: -15, width: 470, height: 92 },
  };
  fs.writeFileSync(
    path.join(stageDirectory, 'state.json'),
    JSON.stringify({ captionTemplates: [template], captionTemplateId: template.id }),
  );
  const server = createWorkspaceServer({ dataDirectory });
  t.after(async () => {
    await server.shutdown();
    assert.equal(path.dirname(dataDirectory), path.resolve(os.tmpdir()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  const loaded = await request(server, '/api/workspace', { enabled: ['stage'] });
  assert.equal(loaded.status, 200, loaded.bytes.toString());
  const route = '/api/workspace/layout/stage';
  const before = (await request(server, route)).json().layout;
  assert.equal(before.captionTemplateId, template.id);
  assert.equal(before.captionX, 26);
  assert.deepEqual(bounds(template), { x: -18, y: -15, width: 2400, height: 175 });
  const moved = await request(server, route, {
    captionTemplateId: template.id,
    base: { captionX: 26, captionY: 700 },
    draft: { captionX: -155, captionY: 852 },
  });
  assert.equal(moved.status, 200, moved.bytes.toString());
  assert.equal(moved.json().layout.captionX, -155);
  const saved = JSON.parse(fs.readFileSync(path.join(stageDirectory, 'state.json'), 'utf8'));
  assert.deepEqual(saved.captionTemplates[0], {
    ...template,
    backgroundFit: 'auto',
    canvasAnchor: template.position,
    position: { x: -155, y: 852 },
  });
  const builtin = await request(server, route + '?captionTemplate=');
  assert.equal(builtin.json().layout.captionTemplateId, '');
  assert.equal(builtin.json().layout.captionX, 96);
  assert.equal(
    (
      await request(server, route, {
        captionTemplateId: template.id,
        base: { captionX: 26 },
        draft: { captionX: 48 },
      })
    ).status,
    409,
  );
});

test('stage layout applies positive sizes beyond the former preview and canvas limits', async (t) => {
  const { createWorkspaceServer } = require('../server/workspace-server');
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-size-'));
  const server = createWorkspaceServer({ dataDirectory });
  t.after(async () => {
    await server.shutdown();
    assert.equal(path.dirname(dataDirectory), path.resolve(os.tmpdir()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  assert.equal((await request(server, '/api/workspace', { enabled: ['stage'] })).status, 200);
  const route = '/api/workspace/layout/stage';
  const initial = (await request(server, route)).json().layout;
  const original = { logoSize: initial.logoSize, lowerWidth: initial.lowerWidth };
  const large = { logoSize: 4096.5, lowerWidth: 6400 };
  const small = { logoSize: 0.25, lowerWidth: 12.5 };
  for (const [base, draft] of [
    [original, large],
    [large, small],
  ]) {
    const result = await request(server, route, { base, draft });
    assert.equal(result.status, 200, result.bytes.toString());
    assert.equal(result.json().layout.logoSize, draft.logoSize);
    assert.equal(result.json().layout.lowerWidth, draft.lowerWidth);
  }
  assert.equal(
    (await request(server, route, { base: { logoSize: small.logoSize }, draft: { logoSize: 0 } }))
      .status,
    400,
  );
  const saved = JSON.parse(
    fs.readFileSync(path.join(dataDirectory, 'stage', 'state.json'), 'utf8'),
  );
  assert.equal(saved.style.logoSize, small.logoSize);
  assert.equal(saved.style.lowerWidth, small.lowerWidth);
  const dimensions = (await request(server, route)).json().layout;
  const resize = await request(server, route, {
    base: { eventWidth: dimensions.eventWidth, eventHeight: dimensions.eventHeight },
    draft: { eventWidth: 1920, eventHeight: 1080 },
  });
  assert.equal(resize.status, 200);
  const layout = resize.json().layout;
  assert.equal(layout.eventWidth, 1920);
  assert.equal(layout.eventHeight, 1080);
  assert.equal(layout.channelWidth, dimensions.channelWidth);
});

test('lyric viewport follows cue changes without resetting manual scroll on updates', () => {
  const follow = require('../modules/stage/captions').createCaptionFollower();
  const list = {
    scrollTop: 0,
    clientHeight: 240,
    clientTop: 1,
    getBoundingClientRect: () => ({ top: 100 }),
    children: Array.from({ length: 50 }, (_, index) => ({
      getBoundingClientRect: () => ({ top: 101 + index * 40 - list.scrollTop, height: 40 }),
    })),
  };

  follow(list, 'song-a', 16);
  assert.equal(list.scrollTop, 540);
  list.scrollTop = 40;
  follow(list, 'song-a', 16);
  assert.equal(list.scrollTop, 40);
  follow(list, 'song-a', 16, { index: 24, revision: 1 });
  assert.equal(list.scrollTop, 860);
  follow(list, 'song-a', 17, { index: 24, revision: 1 });
  assert.equal(list.scrollTop, 580);

  list.clientHeight = 0;
  follow(list, 'song-a', 26);
  assert.equal(list.scrollTop, 580);
  list.clientHeight = 240;
  follow(list, 'song-a', 26);
  assert.equal(list.scrollTop, 940);
  follow(list, 'song-b');
  assert.equal(list.scrollTop, 0);
});

test('subtitle renderer moves and animates the entire caption while retaining media through exit', () => {
  const elements = new Map(),
    listeners = {},
    mounted = new Map(),
    plays = [];
  const parent = {};
  const context = vm.createContext({
    URL,
    URLSearchParams,
    parent,
    location: { search: '?workspacePreview=1', origin: 'http://127.0.0.1:8125' },
    window: {
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
    },
    document: {
      referrer: 'http://127.0.0.1:8120/',
      getElementById(id) {
        if (!elements.has(id)) {
          const classes = new Set();
          elements.set(id, {
            id,
            style: { setProperty() {} },
            classList: {
              toggle: (key, on) => (on ? classes.add(key) : classes.delete(key)),
              contains: (key) => classes.has(key),
              remove: (key) => classes.delete(key),
            },
            animate(frames, options) {
              const playback = { frames, options, cancel() {} };
              plays.push({ id, playback });
              return playback;
            },
          });
        }
        return elements.get(id);
      },
    },
    matchMedia: () => ({ matches: false }),
    StageCaptions: require('../modules/stage/captions'),
    StageMedia: {
      mount: ({ id }) => ({
        set: (file) => mounted.set(id, file),
        stop: () => mounted.delete(id),
        size: () => ({ width: 1920, height: 1080 }),
      }),
    },
    getComputedStyle: () => ({ opacity: '0.6', clipPath: 'inset(0 0 0 0)' }),
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../ui/stage/graphics.js'), 'utf8'),
    context,
  );
  const live = {
    id: 'sample',
    position: { x: 100, y: 810 },
    background: media,
    backgroundFit: 'auto',
    canvasAnchor: { x: 100, y: 810 },
    backgroundBox: { x: -20, y: 0, width: 700, height: 90 },
    textBox: { x: 4, y: 12, width: 610, height: 60 },
  };
  const state = {
    captionLive: { caption: '第一句', index: 0, template: live },
    captionTemplates: [live],
    layers: { caption: true },
    style: { motion: false, captionX: 96, captionY: 958, font: 'template', fontAsset: '' },
  };
  const get = (id) => elements.get(id).style;
  const preset = require('../modules/stage/templates').templates[0];
  context.renderCaption(state, preset);
  assert.equal(get('caption').left, '100px');
  assert.equal(get('caption').width, '700px');
  listeners.message({
    source: parent,
    origin: 'http://127.0.0.1:8120',
    data: {
      type: 'preview-layout',
      module: 'stage',
      captionTemplateId: live.id,
      layout: { captionX: -80, captionY: 640 },
    },
  });
  context.renderCaption(state, preset);
  assert.equal(get('caption').left, '-80px');
  assert.equal(get('caption').top, '640px');
  assert.equal(get('captionBackground').left, '-100px');
  assert.equal(get('captionBackground').top, '-810px');
  assert.equal(get('captionBackground').width, '1920px');
  assert.equal(get('captionBox').left, '24px');
  assert.equal(get('captionBox').top, '12px');

  live.appearance = {
    transition: { enter: 'wipe-left-to-right', exit: 'mix', enterDuration: 850, exitDuration: 550 },
  };
  context.renderCaption(state, preset);
  const hidden = { ...state, layers: { caption: false } };
  context.renderCaption(hidden, preset);
  context.renderCaption(hidden, preset);
  assert.equal(plays.length, 1);
  const [fade] = plays;
  assert.equal(fade.id, 'captionLayer');
  assert.equal(fade.playback.frames[1].opacity, 0);
  assert.equal(fade.playback.options.duration, 550);
  assert.equal(elements.get('captionText').textContent, '第一句');
  assert.equal(mounted.get('captionBackground'), media);
  assert(elements.get('caption').classList.contains('visible'));

  context.renderCaption(state, preset);
  const wipe = plays[1].playback;
  assert.equal(wipe.frames[0].opacity, '0.6');
  assert.equal(wipe.options.duration, 850);
  fade.playback.onfinish();
  assert(elements.get('caption').classList.contains('visible'));
  wipe.onfinish();
  context.renderCaption(
    { ...state, captionLive: { ...state.captionLive, caption: '下一句' } },
    preset,
  );
  assert.equal(plays.length, 2);
  context.renderCaption(hidden, preset);
  plays[2].playback.onfinish();
  assert(!elements.get('caption').classList.contains('visible'));
  assert.equal(elements.get('captionText').textContent, '');
  assert(!mounted.has('captionBackground'));
  context.renderCaption(state, preset);
  assert.equal(plays[3].playback.frames[0].clipPath, 'inset(0 100% 0 0)');
  const legacy = {
    ...hidden,
    live: { title: '节目名', performer: '表演者' },
    layers: { caption: false, lower: true },
  };
  context.renderCaption(legacy, preset);
  plays[4].playback.onfinish();
  context.renderCaption(legacy, preset);
  assert(!elements.get('caption').classList.contains('visible'));
  assert.equal(elements.get('captionText').textContent, '');
});

test('the same image player mounts compatible frames for a stinger, lyrics and the global logo', async () => {
  const shown = { logo: [], lyric: [], stinger: [] };
  class TestImage {
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.onload());
    }
  }
  const host = (id) => ({
    dataset: {},
    replaceChildren(image) {
      if (image) shown[id].push(image.url);
    },
  });
  const context = vm.createContext({
    Image: TestImage,
    Date,
    performance,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ fps: 25, frames: 3 }) }),
    hosts: Object.fromEntries(Object.keys(shown).map((id) => [id, host(id)])),
    media,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/stage/media.js'), 'utf8'), context);
  const players = vm.runInContext(
    `Object.fromEntries(Object.entries(hosts).map(([id, host]) => [id, StageMedia.mount(host)]))`,
    context,
  );
  try {
    players.lyric.set(media);
    players.logo.set(media);
    await new Promise((resolve) => players.stinger.set(media, { loop: false, end: resolve }));
    for (const frames of Object.values(shown)) {
      assert.match(frames[0], /0000000\.png$/);
      assert(frames.some((url) => /000000[12]\.png$/.test(url)));
    }
  } finally {
    Object.values(players).forEach((player) => player.stop());
  }
});

test('the saved promotion roster is always available with ranks, score ties and zero', async (t) => {
  const { server } = setup(t);
  const entries = Array.from({ length: 27 }, (_, i) => ({
    id: 'p' + i,
    name: '选手 ' + i,
    title: '节目',
    score: [0, 99, 99, null][i] ?? null,
    rank: i === 0 ? 1 : null,
    selected: i !== 26,
  }));
  const draft = {
    id: '',
    title: '晋级',
    background: media,
    sort: 'score',
    columns: { rank: true, name: true, title: false, score: true },
    entries,
  };
  const save = (value) => request(server, '/api/v1/state', { promotions: [value] });
  const live = () => request(server, '/api/stage/promotion');
  assert.equal((await live()).json(), null);
  assert.equal((await save(draft)).status, 200);
  const preview = '/api/stage/promotion-preview';
  assert.deepEqual((await request(server, preview + '?choices=1')).json(), {
    rounds: [{ id: '', name: '未分轮' }],
    defaultRound: '',
  });
  assert.equal((await request(server, preview + '?round=')).json().entries[0].id, 'p1');
  const output = await live();
  assert.deepEqual(
    output
      .json()
      .entries.slice(0, 4)
      .map(({ id, rank }) => [id, rank]),
    [
      ['p1', 1],
      ['p2', 1],
      ['p0', 3],
      ['p3', null],
    ],
  );
  assert.equal(output.json().columns.title, false);
  assert.equal(
    (
      await request(server, '/api/stage/promotion', undefined, {
        'if-none-match': output.headers.etag,
      })
    ).status,
    304,
  );
  assert.equal((await save({ ...draft, title: '更新名单', sort: 'manual' })).status, 200);
  assert.equal((await live()).json().title, '更新名单');
  assert.equal((await request(server, preview)).json().title, '更新名单');
  assert.equal((await live()).json().entries[0].id, 'p0');

  const beforeHide = (await live()).json();
  assert.equal((await call(server, 'all.hide')).status, 200);
  assert.deepEqual((await live()).json(), beforeHide);
  assert.equal(beforeHide.listVisible, true);
  assert.equal(beforeHide.backgroundVisible, true);
  for (const obsolete of ['promotion.take', 'promotion.layers', 'promotion.page'])
    assert.equal((await call(server, obsolete)).status, 404);
  for (const url of [
    '/stage/control.html',
    '/stage/graphics.html',
    '/stage/promotion.html',
    '/stage-roster/broadcast.css',
    '/stage-controls/vendor/xlsx.full.min.js',
  ])
    assert.equal((await request(server, url)).status, 200, url);
});

test('promotion positions and sizes save independently from the roster and update both outputs', async (t) => {
  const { createWorkspaceServer } = require('../server/workspace-server');
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-promotion-layout-'));
  const server = createWorkspaceServer({ dataDirectory });
  t.after(async () => {
    await server.shutdown();
    assert.equal(path.dirname(dataDirectory), path.resolve(os.tmpdir()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  assert.equal((await request(server, '/api/workspace', { enabled: ['stage'] })).status, 200);
  const route = '/api/workspace/layout/stage-promotion';
  const base = {
    promotionListX: 96,
    promotionListY: 112,
    promotionListWidth: 1728,
    promotionListHeight: 854,
    promotionBackgroundX: 0,
    promotionBackgroundY: 0,
    promotionBackgroundWidth: 1920,
    promotionBackgroundHeight: 1080,
  };
  const draft = {
    ...base,
    promotionListX: -20,
    promotionListY: 345,
    promotionListWidth: 800.5,
    promotionListHeight: 420,
    promotionBackgroundX: 15,
    promotionBackgroundWidth: 2400,
    promotionBackgroundHeight: 600,
  };
  assert.deepEqual((await request(server, route)).json().layout, base);
  assert.deepEqual((await request(server, route, { base, draft })).json().layout, draft);
  assert.equal((await request(server, route, { base, draft })).status, 409);
  assert.equal(
    (
      await request(server, route, {
        base: { promotionListX: -20 },
        draft: { promotionListX: -1921 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(server, route, {
        base: { promotionListHeight: 420 },
        draft: { promotionListHeight: 0 },
      })
    ).status,
    400,
  );
  const verification = createStageServer({ dataDirectory: path.join(dataDirectory, 'stage') });
  try {
    for (const endpoint of ['promotion', 'promotion-preview'])
      assert.deepEqual(
        (await request(verification, '/api/stage/' + endpoint + '?layout=1')).json(),
        {
          live: null,
          layout: draft,
        },
      );
  } finally {
    verification.close();
  }
});

test('promotion viewers share automatic pagination as the layout and round change', async (t) => {
  let now = 0;
  const { server, dataDirectory } = setup(t, { promotionNow: () => now });
  const { grid } = require('../modules/stage/promotion-layout');
  const width = { promotionListWidth: 1000 };
  const compact = { ...width, promotionListHeight: 400 };
  assert.equal(grid(26).pageSize, 24);
  assert.equal(grid(26, width).pageSize, 12);
  assert.equal(grid(26, compact).pageSize, 3);
  const entries = Array.from({ length: 26 }, (_, index) => ({
    id: 'p' + index,
    name: '选手 ' + index,
    title: '节目',
    score: null,
    rank: null,
    selected: true,
  }));
  const promotions = [
    {
      id: '',
      title: '晋级',
      background: '',
      sort: 'manual',
      columns: { rank: true, name: true, title: true, score: true },
      entries,
    },
  ];
  const round = { id: 'second', name: '第二轮' };
  const second = {
    ...promotions[0],
    id: round.id,
    title: '第二轮晋级',
    entries: entries.slice(0, 5),
  };
  promotions.push(second);
  const save = (patch) => request(server, '/api/v1/state', patch);
  assert.equal((await save({ rounds: [round], promotions })).status, 200);
  assert.equal((await save({ promotionRoundId: 'unknown' })).status, 400);
  const output = '/api/stage/promotion?layout=1';
  const live = async (instance = server) => (await request(instance, output)).json().live;
  assert.equal((await live()).id, '');
  assert.equal((await live()).page, 0);
  now = 8000;
  assert.equal((await live()).page, 1);
  assert.equal((await live()).page, 1);
  now = 16000;
  assert.equal((await live()).page, 0);

  assert.equal((await save({ style: compact })).status, 200);
  assert.equal((await live()).page, 0);
  now += 8 * 8000;
  assert.equal((await live()).page, 8);
  assert.equal((await request(server, '/api/stage/promotion-preview')).json().page, 0);

  assert.equal((await save({ promotionRoundId: 'second', promotions })).status, 200);
  assert.equal((await live()).title, '第二轮晋级');
  assert.equal((await live()).page, 0);
  assert.equal((await save({ promotions: [...promotions].reverse() })).status, 200);
  assert.equal((await live()).id, 'second');
  assert.equal((await request(server, '/api/stage/promotion-preview?round=')).json().id, '');
  const choices = (await request(server, '/api/stage/promotion-preview?choices=1')).json();
  assert.equal(choices.defaultRound, 'second');

  const stateFile = path.join(dataDirectory, 'state.json');
  const legacy = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete legacy.promotionRoundId;
  legacy.promotions.reverse();
  legacy.promotionLive = { ...(await live()), title: '旧快照', listVisible: false };
  fs.writeFileSync(stateFile, JSON.stringify(legacy));
  const restarted = createStageServer({ dataDirectory });
  try {
    const { live: restored, layout } = (await request(restarted, output)).json();
    assert.equal(restored.id, 'second');
    assert.equal(restored.title, '第二轮晋级');
    assert.equal(restored.listVisible, true);
    assert.equal(layout.promotionListHeight, 400);
  } finally {
    restarted.close();
  }
});

test('stage design packages validate, round-trip media and drive both stage outputs', async (t) => {
  const { server, dataDirectory } = setup(t);
  const base = '/api/stage/design-templates';
  const example = (slot) =>
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../docs/stage-design', slot + '-example.vmix-graphics.json'),
      ),
    );
  const image = samplePng();
  const data = 'data:image/png;base64,' + image.toString('base64');
  const caption = example('caption');
  caption.elements.unshift({ type: 'image', x: 0, y: 0, width: 1100, height: 134, src: data });
  assert.equal((await request(server, base + '/validate', caption)).status, 200);
  assert.deepEqual((await request(server, base)).json().templates, []);
  const withoutField = { ...caption, elements: caption.elements.filter(({ bind }) => !bind) };
  assert.equal((await request(server, base + '/validate', withoutField)).status, 400);
  assert.equal(
    (
      await request(server, base + '/validate', {
        ...caption,
        elements: [...caption.elements, caption.elements.at(-1)],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(server, base + '/validate', {
        ...caption,
        elements: [
          { ...caption.elements[0], src: 'https://example.com/plate.png' },
          ...caption.elements.slice(1),
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(server, base, caption, { origin: 'http://other.example' })).status,
    403,
  );

  const imported = await request(server, base, caption);
  assert.equal(imported.status, 201);
  assert.match(
    imported.json().template.elements[0].src,
    /^\/stage-design-media\/[a-f0-9]{64}\.png$/,
  );
  const served = await request(server, imported.json().template.elements[0].src);
  assert.equal(served.status, 200);
  assert.deepEqual(served.bytes, image);
  const downloaded = (await request(server, base + '/' + caption.id)).json();
  assert.equal(downloaded.elements[0].src, data);
  assert.equal(downloaded.elements.at(-1).latinFont, 'Arial');
  assert.equal(downloaded.motion.enter.duration, 460);
  assert.equal((await request(server, base, caption)).status, 409);
  const state = (await request(server, '/api/v1/state')).json();
  assert.equal(state.captionTemplates.find(({ id }) => id === caption.id).designId, caption.id);
  assert.equal(
    (
      await request(server, '/api/v1/state', {
        captionTemplateId: caption.id,
        programs: [
          { id: 'act-1', type: '歌唱', title: '歌曲', performer: '甲', caption: '第一句\n第二句' },
        ],
      })
    ).status,
    200,
  );
  assert.equal((await call(server, 'caption.take', { programId: 'act-1', index: 1 })).status, 200);
  assert.equal(
    (await request(server, '/api/v1/state')).json().captionLive.template.designId,
    caption.id,
  );
  assert.equal(
    (await request(server, base + '?replace=1', { ...caption, name: '更新后' })).json().template
      .revision,
    2,
  );

  const promotion = example('promotion');
  assert.equal((await request(server, base, promotion)).status, 201);
  const roster = {
    id: '',
    title: '第一轮晋级名单',
    background: '',
    sort: 'score',
    designId: promotion.id,
    columns: { rank: true, name: true, title: true, score: true },
    entries: Array.from({ length: 25 }, (_, i) => ({
      id: 'contestant-' + i,
      name: '选手 ' + i,
      title: '节目 ' + i,
      score: 100 - i,
      rank: null,
      selected: true,
    })),
  };
  assert.equal(
    (await request(server, '/api/v1/state', { promotions: [{ ...roster, designId: caption.id }] }))
      .status,
    400,
  );
  assert.equal((await request(server, '/api/v1/state', { promotions: [roster] })).status, 200);
  const result = (await request(server, '/api/stage/promotion?layout=1')).json();
  assert.equal(result.design.id, promotion.id);
  assert.equal(result.live.entries[0].score, 100);
  const before = require('../modules/stage/promotion-layout').grid(
    25,
    result.layout,
    result.design,
  );
  const narrow = require('../modules/stage/promotion-layout').grid(
    25,
    { promotionListWidth: 680, promotionListHeight: 380 },
    result.design,
  );
  assert(narrow.pageCount > before.pageCount);
  assert.equal(
    (await request(server, '/api/stage/promotion-preview?layout=1&round=')).json().design.id,
    promotion.id,
  );
  assert.equal((await call(server, 'all.hide')).status, 200);
  assert.equal(
    (await request(server, '/api/stage/promotion?layout=1')).json().design.id,
    promotion.id,
  );

  const restarted = createStageServer({ dataDirectory });
  try {
    assert.equal((await request(restarted, base + '/' + caption.id)).json().name, '更新后');
    assert.equal(
      (await request(restarted, '/api/stage/promotion?layout=1')).json().design.id,
      promotion.id,
    );
  } finally {
    restarted.close();
  }
});

function samplePng() {
  function chunk(name, bytes) {
    const key = Buffer.from(name);
    const size = Buffer.alloc(4);
    const checksum = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([key, bytes])));
    return Buffer.concat([size, key, bytes, checksum]);
  }
  const width = 64,
    height = 32;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 6], 8);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      pixels.set([230, 32, 90, x < 20 ? 0 : x < 40 ? 128 : 255], y * (width * 4 + 1) + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('caption packages carry sequence frames, both fonts and independent timings into a new project', async (t) => {
  const { dataDirectory } = setup(t);
  const { server: destination } = setup(t);
  const assetDirectory = path.join(dataDirectory, 'assets');
  const background = 'a'.repeat(32) + '.frames.json';
  const font = 'b'.repeat(32) + '.ttf';
  const latinFont = 'c'.repeat(32) + '.woff2';
  const backgroundDirectory = path.join(assetDirectory, 'a'.repeat(32) + '.frames');
  fs.mkdirSync(backgroundDirectory);
  const frame = samplePng();
  const sequence = { width: 64, height: 32, fps: 25, frames: 2 };
  fs.writeFileSync(path.join(backgroundDirectory, 'sequence.json'), JSON.stringify(sequence));
  for (const name of ['0000000.png', '0000001.png'])
    fs.writeFileSync(path.join(backgroundDirectory, name), frame);
  fs.writeFileSync(path.join(assetDirectory, font), 'Chinese font');
  fs.writeFileSync(path.join(assetDirectory, latinFont), 'Latin font');
  fs.writeFileSync(
    path.join(assetDirectory, 'library.json'),
    JSON.stringify(
      [background, font, latinFont].map((file, index) => ({
        id: file.slice(0, 32),
        name: file,
        file,
        kind: index ? 'font' : 'video',
      })),
    ),
  );
  const source = createStageServer({ dataDirectory });
  t.after(() => source.close());
  const appearance = {
    motion: true,
    fontSize: 36,
    fontAsset: font,
    latinFontAsset: latinFont,
    transition: { enter: 'wipe-left-to-right', exit: 'mix', enterDuration: 920, exitDuration: 400 },
  };
  const route = '/api/stage/caption-package';
  const url =
    route +
    '?' +
    new URLSearchParams({
      template: JSON.stringify({
        id: 'original',
        name: '舞台字幕',
        appearance,
        background,
        x: 96,
        y: 958,
        width: 918,
      }),
    });
  const exported = await request(source, url);
  assert.equal(exported.status, 200);
  assert.match(exported.headers['content-disposition'], /stage-caption/);
  assert.equal((await request(destination, route, exported.bytes.subarray(0, -1))).status, 400);
  assert.equal(destination.workspaceState().captionTemplates.length, 0);
  assert.deepEqual((await request(destination, '/api/stage/library')).json().assets, []);
  const imported = await request(destination, route, exported.bytes);
  assert.equal(imported.status, 200, imported.bytes.toString());
  const template = imported.json().template;
  assert.notEqual(template.id, 'original');
  assert.notEqual(template.background, background);
  assert.deepEqual(template.appearance.transition, appearance.transition);
  const mediaPath = '/assets/' + template.background;
  assert.deepEqual((await request(destination, mediaPath + '/sequence.json')).json(), sequence);
  assert.deepEqual((await request(destination, mediaPath + '/0000001.png')).bytes, frame);
  assert.equal(
    (await request(destination, '/assets/' + template.appearance.fontAsset)).bytes.toString(),
    'Chinese font',
  );
  assert.equal(
    (await request(destination, '/assets/' + template.appearance.latinFontAsset)).bytes.toString(),
    'Latin font',
  );
  assert.equal(destination.workspaceState().captionTemplateId, '');
});

test('actual PNG sequence and ProRes 4444 MOV imports preserve all three alpha levels', async (t) => {
  let ffmpeg;
  try {
    ffmpeg = encoder();
  } catch (_) {
    return t.skip('FFmpeg is unavailable');
  }
  const { server, dataDirectory } = setup(t);
  const png = samplePng();
  const original = path.join(dataDirectory, 'sample.png');
  const movie = path.join(dataDirectory, 'sample.mov');
  fs.writeFileSync(original, png);
  const fixture = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      original,
      '-c:v',
      'prores_ks',
      '-profile:v',
      '4',
      '-pix_fmt',
      'yuva444p10le',
      movie,
    ],
    { windowsHide: true },
  );
  assert.equal(fixture.status, 0, fixture.stderr.toString());
  for (const [query, bytes] of [
    ['name=frame1.png&fps=25', Buffer.concat([png, png, png])],
    ['name=sample.mov', fs.readFileSync(movie)],
  ]) {
    const upload = await request(server, '/api/stage/media?' + query, bytes);
    assert.equal(upload.status, 200, upload.bytes.toString());
    const file = upload.json().asset.file;
    assert.match(file, /\.frames\.json$/);
    const manifest = await request(server, '/assets/' + file + '/sequence.json');
    assert.equal(manifest.status, 200);
    assert.equal(manifest.json().frames, query.includes('fps=') ? 3 : 1);
    const playback = (await request(server, '/assets/' + file + '/playback.json')).json();
    const [left, top, width, height] = playback.crops[0];
    assert(width < 64);
    assert.equal(playback.width, 64);
    assert.equal(playback.height, 32);
    const frame = '/assets/' + file + '/0000000.png';
    const stream = await request(server, frame, undefined, { range: 'bytes=0-31' });
    assert.equal(stream.status, 206);
    assert.equal(stream.bytes.length, 32);
    const decodeFrame = (input) =>
      spawnSync(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          'pipe:0',
          '-frames:v',
          '1',
          '-pix_fmt',
          'rgba',
          '-f',
          'rawvideo',
          'pipe:1',
        ],
        { windowsHide: true, input },
      );
    const decode = decodeFrame((await request(server, frame)).bytes);
    assert.equal(decode.status, 0, decode.stderr.toString());
    for (const [x, expected] of [
      [6, 0],
      [31, 128],
      [55, 255],
    ]) {
      const matte = decode.stdout[(64 * 14 + x) * 4 + 3];
      assert(Math.abs(matte - expected) < 10, `matte ${matte} at ${x}, expected ${expected}`);
    }
    const crop = await request(server, '/assets/' + file + '/crop-0000000.png');
    assert.equal(crop.status, 200);
    const cropped = decodeFrame(crop.bytes);
    assert.equal(cropped.status, 0, cropped.stderr.toString());
    const expected = [];
    for (let y = top; y < top + height; y++) {
      const start = (y * 64 + left) * 4;
      expected.push(decode.stdout.subarray(start, start + width * 4));
    }
    assert.deepEqual(cropped.stdout, Buffer.concat(expected));
  }
});
