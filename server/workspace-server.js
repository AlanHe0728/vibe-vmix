'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStaticHandler } = require('./static-files');
const { json, readObject, method } = require('./http-utils');
const { AppError } = require('../core/errors');
const { listenLocal, closeLocal } = require('./listen-local');

// Metadata is intentionally independent of module code, assets and state.
const catalog = [
  {
    id: 'stage',
    name: '舞台节目',
    description: '歌唱、舞蹈、武术与综合演出',
    features: ['节目单', '台标与活动 Logo', '赞助商', '字幕条', '转场', '素材库'],
    port: 8125,
  },
  {
    id: 'football',
    name: '足球赛事',
    description: '沿用已有足球包装与比赛操作',
    features: ['比分与计时', '球员事件', '名单', '场内换人', 'D200'],
    port: 8123,
  },
  {
    id: 'ae-live',
    name: 'AE 直播连接',
    description: '连接 AE 插件、直播控件与动画缓存',
    features: ['合成控件', '画面刷新', '动画缓存', 'vMix 播放控制'],
    port: 8126,
  },
];

function createWorkspaceServer({
  dataDirectory,
  project = path.resolve(__dirname, '..'),
  logger = console,
}) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const configFile = path.join(dataDirectory, 'workspace.json');
  const saved = fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''))
    : { enabled: [] };
  const loaded = new Map();
  let busy = false;
  let shuttingDown = false;
  const staticFiles = createStaticHandler([
    { prefix: '/workspace/', directory: path.join(project, 'ui/workspace') },
  ]);
  const stageLayoutKeys = [
    'channelX',
    'channelY',
    'eventX',
    'eventY',
    'sponsorX',
    'sponsorY',
    'lowerX',
    'lowerY',
    'lowerWidth',
    'captionX',
    'captionY',
    'logoSize',
  ];
  function layout(id) {
    const service = loaded.get(id)?.server;
    if (!service) throw new AppError('模块未加载', 404);
    if (id === 'ae-live') return service.workspaceLayout();
    const state = service.workspaceState();
    if (id === 'stage')
      return Object.fromEntries(stageLayoutKeys.map((key) => [key, state.style[key]]));
    const positions = require('../packages/football-classic.json').positions;
    return Object.fromEntries(
      Object.entries(positions).flatMap(([key, point]) => [
        [key + '_pos', state[key + '_pos'] || { x: point[0], y: point[1] }],
        [key + '_scale', state[key + '_scale'] ?? 1],
      ]),
    );
  }
  function applyLayout(id, input) {
    const current = layout(id);
    const { base, draft } = input;
    if (
      !base ||
      !draft ||
      Array.isArray(base) ||
      Array.isArray(draft) ||
      typeof base !== 'object' ||
      typeof draft !== 'object'
    )
      throw new AppError('位置数据无效');
    const keys = Object.keys(draft);
    if (
      !keys.length ||
      keys.length !== Object.keys(base).length ||
      keys.some((key) => !Object.hasOwn(current, key) || !Object.hasOwn(base, key))
    )
      throw new AppError('位置数据无效');
    for (const key of keys) {
      if (JSON.stringify(current[key]) !== JSON.stringify(base[key]))
        throw new AppError('播出位置已在其他窗口修改，请恢复播出位置后重新调整', 409);
      const value = draft[key];
      if (id === 'football' && key.endsWith('_pos')) {
        if (
          !value ||
          Object.keys(value).sort().join(',') !== 'x,y' ||
          !Number.isFinite(value.x) ||
          !Number.isFinite(value.y) ||
          value.x < 0 ||
          value.x > 1920 ||
          value.y < 0 ||
          value.y > 1080
        )
          throw new AppError('位置超出画布范围');
      } else if (typeof value !== 'number' || !Number.isFinite(value))
        throw new AppError('位置数值无效');
      if (
        (id === 'football' && key.endsWith('_scale') && (value < 0.3 || value > 3)) ||
        (id === 'ae-live' &&
          ((key === 'x' && (value < -1920 || value > 1920)) ||
            (key === 'y' && (value < -1080 || value > 1080)) ||
            (key === 'scale' && (value < 0.1 || value > 3))))
      )
        throw new AppError('位置或缩放超出范围');
    }
    const service = loaded.get(id).server;
    if (id === 'ae-live') service.workspaceSetLayout({ ...current, ...draft });
    else service.workspaceUpdate(id === 'stage' ? { style: draft } : draft);
    return layout(id);
  }
  function describe() {
    return {
      modules: catalog.map((entry) => ({
        ...entry,
        enabled: loaded.has(entry.id),
        url: loaded.get(entry.id)?.url || null,
      })),
      loaded: [...loaded.keys()],
      version: '2.0.0-beta.1',
    };
  }
  function validate(ids) {
    if (
      !Array.isArray(ids) ||
      ids.length > catalog.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !catalog.some((entry) => entry.id === id))
    )
      throw new AppError('模块选择无效');
  }
  async function load(id) {
    const entry = catalog.find((item) => item.id === id);
    let service;
    if (id === 'football') {
      // The require and its complete dependency tree run only after selection.
      service = require('./football-server').createFootballServer({
        stateFile: path.join(dataDirectory, 'state.json'),
      });
    } else if (id === 'stage') {
      const directory = path.join(dataDirectory, 'stage');
      fs.mkdirSync(directory, { recursive: true });
      service = require('./stage-server').createStageServer({ dataDirectory: directory, project });
    } else {
      const directory = path.join(dataDirectory, 'ae-live');
      fs.mkdirSync(directory, { recursive: true });
      service = require('./ae-live-server').createAELiveServer({
        dataDirectory: directory,
        project,
      });
    }
    try {
      return { server: service, url: await listenLocal(service, entry.port) };
    } catch (error) {
      await closeLocal(service);
      throw error;
    }
  }
  function releaseCode(id) {
    const modulePath = path.join(project, 'modules', id) + path.sep;
    for (const file of Object.keys(require.cache)) {
      if (
        file.startsWith(modulePath) ||
        file === path.join(project, 'server', id + '-server.js') ||
        (id === 'stage' && file === path.join(project, 'server', 'stage-assets.js'))
      )
        delete require.cache[file];
    }
  }
  async function select(ids, persist = true) {
    validate(ids);
    if (busy || shuttingDown) throw new AppError('模块正在切换，请稍后重试', 409);
    busy = true;
    const added = new Map();
    try {
      for (const id of ids) if (!loaded.has(id)) added.set(id, await load(id));
      if (persist) {
        fs.writeFileSync(configFile + '.tmp', JSON.stringify({ enabled: ids }, null, 2));
        fs.renameSync(configFile + '.tmp', configFile);
      }
      for (const [id, instance] of loaded) {
        if (!ids.includes(id)) {
          await closeLocal(instance.server);
          loaded.delete(id);
          releaseCode(id);
        }
      }
      for (const [id, instance] of added) loaded.set(id, instance);
      return describe();
    } catch (error) {
      for (const [id, instance] of added) {
        await closeLocal(instance.server);
        releaseCode(id);
      }
      throw error;
    } finally {
      busy = false;
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      // Local control writes must come from this application, not a remote site.
      const origin = req.headers.origin;
      if (origin && origin !== 'http://' + req.headers.host) throw new AppError('来源不允许', 403);
      if (pathname === '/api/workspace') {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'GET') json(res, { ok: true, ...describe() });
        else {
          method(req, 'POST');
          json(res, { ok: true, ...(await select((await readObject(req, 8192)).enabled)) });
        }
        return;
      }
      const layoutRoute = pathname.match(/^\/api\/workspace\/layout\/(stage|football|ae-live)$/);
      if (layoutRoute) {
        res.setHeader('Cache-Control', 'no-store');
        const id = layoutRoute[1];
        if (req.method === 'GET') json(res, { ok: true, layout: layout(id) });
        else {
          method(req, 'POST');
          json(res, { ok: true, layout: applyLayout(id, await readObject(req, 8192)) });
        }
        return;
      }
      if (pathname === '/') {
        res.writeHead(302, { Location: '/workspace/index.html' });
        res.end();
        return;
      }
      await staticFiles(req, res, decodeURIComponent(pathname));
    } catch (error) {
      if (!(error instanceof AppError)) logger.error(error);
      json(res, { ok: false, error: error.message }, error.status || 500);
    }
  });
  server.initialize = () => select(saved.enabled, false);
  server.describe = describe;
  server.shutdown = async () => {
    shuttingDown = true;
    while (busy) await new Promise((resolve) => setTimeout(resolve, 25));
    for (const [id, instance] of loaded) {
      await closeLocal(instance.server);
      releaseCode(id);
    }
    loaded.clear();
    await closeLocal(server);
  };
  return server;
}

module.exports = { createWorkspaceServer, catalog };
