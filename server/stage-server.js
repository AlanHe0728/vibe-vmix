'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createServer } = require('./create-server');
const { createStageModule } = require('../modules/stage');
const { lines, layoutTemplate } = require('../modules/stage/captions');
const { templates } = require('../modules/stage/templates');
const { promotionSnapshot } = require('../modules/stage/show');
const { createAssetLibrary } = require('./stage-assets');
const { createNetworkSession } = require('./network-session');
const { createStaticHandler, operatorTheme } = require('./static-files');
const { json, readObject, method, sendSnapshot } = require('./http-utils');
const { AppError } = require('../core/errors');
const {
  stageDesign,
  captionLink,
  mediaPrefix,
  byteLimit: designLimit,
} = require('../modules/stage/design');
const { createStageDesignAssets } = require('./stage-design-assets');

const {
  defaults: promotionDefaults,
  grid: promotionGrid,
} = require('../modules/stage/promotion-layout');
const promotionLayoutFields = Object.keys(promotionDefaults);
const promotionPageMs = 8000;

function promotionLayout({ style }) {
  return Object.fromEntries(promotionLayoutFields.map((key) => [key, style[key]]));
}

function promotionDesign(state, live) {
  return live?.designId && state.stageDesigns.find(({ id }) => id === live.designId);
}

function designEtag(design) {
  return '"stage-design-' + design.id + '-' + design.revision + '"';
}

function promotionResponse(state, live, preview = false) {
  const design = promotionDesign(state, live);
  return {
    live,
    layout: promotionLayout(state),
    ...(state.style.motion === false && { motion: false }),
    ...(design && { design, ...(preview && { eventLogo: state.eventAsset }) }),
  };
}

function createStageServer({
  dataDirectory,
  project = path.resolve(__dirname, '..'),
  vmixFetch = fetch,
  sharedVmixPort = () => null,
  promotionNow = () => performance.now(),
  now = Date.now,
}) {
  const library = createAssetLibrary(path.join(dataDirectory, 'assets'));
  const designDirectory = path.join(dataDirectory, 'design-assets');
  const designAssets = createStageDesignAssets(designDirectory);
  async function readDesign(req) {
    let document;
    try {
      document = await readObject(req, designLimit);
    } catch (error) {
      if (error.status === 413) throw new AppError('模板超过 4 MiB', 413);
      throw error;
    }
    const template = stageDesign(document);
    if (Buffer.byteLength(JSON.stringify(template)) > designLimit)
      throw new AppError('模板超过 4 MiB', 413);
    return template;
  }
  const stage = createStageModule();
  let promotionKey = '';
  let promotionStartedAt = 0;
  function currentPromotion(state) {
    const roster =
      state.promotionOnAir ?? state.promotions.find(({ id }) => id === state.promotionRoundId);
    const live = roster ? promotionSnapshot(roster) : null;
    if (!live) return null;
    live.background = '';
    live.backgroundVisible = false;
    if (!state.promotionVisible) {
      live.listVisible = false;
      return live;
    }
    const design = promotionDesign(state, live);
    const { pageCount, pageSize } = promotionGrid(live.entries.length, state.style, design, live.columns);
    // Share one page clock across PGM viewers and start at page one on each take.
    const key = JSON.stringify([state.promotionCue, pageSize, design?.revision]);
    const now = promotionNow();
    if (key !== promotionKey) {
      promotionKey = key;
      promotionStartedAt = now;
    }
    if (pageCount > 1)
      live.page = Math.floor((now - promotionStartedAt) / promotionPageMs) % pageCount;
    return live;
  }
  const playCommands = new Set([
    'caption.take',
    'caption.next',
    'caption.previous',
    'caption.hide',
    'program.take',
    'program.next',
    'all.hide',
    'award.take',
    'award.hide',
  ]);
  let application,
    busy = false,
    stopped = false,
    nativeLive = null,
    prepared = null,
    preparation = 0,
    webOperator = '',
    manualOverlay = false;
  const network = createNetworkSession({
    busy: () => busy,
    serve(req, res, pathname) {
      return serveCollaboration(req, res, pathname === '/collab' ? '/collab.html' : pathname);
    },
    async dispatch(req, res, action, actor, name, input) {
      if (action === 'state') {
        method(req, 'GET');
      } else {
        method(req, 'POST');
        await collaborate(action, input, actor, name);
      }
      const snapshot = collaboration(actor);
      if (action === 'state') {
        const etag =
          '"' +
          createHash('sha256')
            .update(application.snapshot().etag)
            .update(JSON.stringify(snapshot))
            .digest('hex') +
          '"';
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.writeHead(304).end();
      }
      json(res, { ok: true, ...snapshot, programs: application.read().programs });
    },
  });
  const serveCollaboration = createStaticHandler([
    operatorTheme(project),
    {
      prefix: '/',
      directory: path.join(project, 'ui/stage'),
      files: ['collab.html', 'control.css', 'collab.js'],
    },
    {
      prefix: '/stage-module/',
      directory: path.join(project, 'modules/stage'),
      files: ['captions.js', 'promotion-layout.js'],
    },
  ]);

  function collaboration(actor) {
    const state = application.read();
    const active = state.vmix.captionMode ? nativeLive?.cue : state.captionLive;
    const live = {
      programId: active?.programId || '',
      index: active?.index ?? -1,
      text: active ? lines(active.caption)[active.index] : '',
      visible: state.vmix.captionMode ? (nativeLive?.visible ?? false) : state.layers.caption,
      uncertain: Boolean(state.vmix.captionMode && nativeLive?.uncertain),
      operator: state.vmix.captionMode ? nativeLive?.operator || '' : webOperator,
    };
    return {
      session: network.status(actor),
      native: state.vmix.captionMode,
      busy,
      live,
      prepared:
        prepared &&
        state.programs.some(
          (item) => item.id === prepared.programId && item.caption === prepared.caption,
        )
          ? {
              programId: prepared.programId,
              revision: prepared.revision,
              index: prepared.index,
              text: prepared.text,
              operator: prepared.operator,
            }
          : null,
    };
  }
  function programCaption(state, payload) {
    const program = state.programs.find((item) => item.id === payload.programId);
    if (!program || program.caption !== payload.caption)
      throw new AppError('节目字幕已更新，请重新选句', 409);
    return program;
  }

  async function collaborate(action, payload, actor = 'host', name = '导播主机') {
    const state = application.read();
    if (action === 'save') {
      const program = programCaption(state, payload);
      if (typeof payload.value !== 'string') throw new AppError('字幕格式无效');
      if (program.caption === payload.value.trim()) return;
      application.update({
        programs: state.programs.map((entry) =>
          entry === program ? { ...entry, caption: payload.value } : entry,
        ),
      });
    } else if (action === 'prepare') {
      const program = programCaption(state, payload);
      const index = payload.index;
      const text = lines(program.caption)[index];
      if (!Number.isInteger(index) || !text) throw new AppError('请选择有效的字幕');
      prepared = {
        programId: program.id,
        caption: program.caption,
        index,
        text,
        operator: name,
        revision: ++preparation,
      };
    } else if (action === 'take') {
      if (!prepared || prepared.revision !== payload.revision)
        throw new AppError('待播字幕已变更，请确认后重新上屏', 409);
      programCaption(state, prepared);
      await play(
        'caption.take',
        { programId: prepared.programId, index: prepared.index },
        actor,
        name,
      );
      if (prepared?.revision === payload.revision) prepared = null;
    } else if (
      ['caption.take', 'caption.next', 'caption.previous', 'caption.hide'].includes(action)
    ) {
      if (action !== 'caption.hide') programCaption(state, payload);
      await play(
        action,
        action === 'caption.hide'
          ? {}
          : {
              programId: payload.programId,
              ...(action === 'caption.take' && { index: payload.index }),
            },
        actor,
        name,
      );
    } else throw new AppError('找不到协作操作', 404);
  }

  async function exclusive(task, actor = 'host') {
    network.requireControl(actor);
    if (busy || stopped) throw new AppError('正在执行播出操作，请稍后重试', 409);
    busy = true;
    try {
      return await task();
    } finally {
      busy = false;
    }
  }

  function overlay(state, visible) {
    return vmix(state, {
      Function: 'OverlayInput' + state.vmix.overlay + (visible ? 'In' : 'Out'),
      Input: state.vmix.input,
    });
  }

  async function play(action, payload, actor = 'host', operator = '导播主机') {
    return exclusive(async () => {
      const state = application.read();
      if (!state.vmix.captionMode) {
        const result = application.execute(action, payload);
        if (action.startsWith('program.') && prepared?.programId !== result.live?.id)
          prepared = null;
        if (action.startsWith('caption.') || action === 'all.hide') webOperator = operator;
        return result;
      }
      const previous = nativeLive;
      if (['caption.take', 'caption.next', 'caption.previous'].includes(action)) {
        let next;
        try {
          next = stage.reduce(
            { ...state, captionLive: previous?.cue || null },
            {
              _command: action,
              payload,
            },
          ).captionLive;
        } catch (error) {
          throw new AppError(error.message);
        }
        try {
          await vmix(state, {
            Function: 'SetText',
            Input: state.vmix.input,
            SelectedName: state.vmix.captionField,
            Value: lines(next.caption)[next.index],
          });
          if (!previous?.visible || previous.uncertain) await overlay(state, true);
        } catch (error) {
          nativeLive = { ...previous, uncertain: true, operator };
          throw error;
        }
        nativeLive = { cue: next, visible: true, uncertain: false, operator };
        return application.status();
      }
      if (action === 'caption.hide' || action === 'all.hide') {
        if (previous?.visible || previous?.uncertain) {
          try {
            await overlay(state, false);
          } catch (error) {
            nativeLive = { ...previous, uncertain: true, operator };
            throw error;
          }
          nativeLive = { ...previous, visible: false, uncertain: false, operator };
        }
      }
      if (action.startsWith('program.')) {
        let item;
        try {
          item = stage.reduce(state, { _command: action, payload }, Date.now()).live;
        } catch (error) {
          throw new AppError(error.message);
        }
        if (previous?.visible || previous?.uncertain) {
          try {
            await overlay(state, false);
          } catch (error) {
            nativeLive = { ...previous, uncertain: true, operator };
            throw error;
          }
          nativeLive = null;
        }
        if (prepared?.programId !== item.id) prepared = null;
      }
      return application.execute(action, payload);
    }, actor);
  }

  async function vmix(state, params) {
    const url = new URL('http://127.0.0.1:' + (sharedVmixPort() ?? state.vmix.port) + '/api/');
    url.search = new URLSearchParams(params).toString();
    let response, body;
    try {
      response = await vmixFetch(url, { signal: AbortSignal.timeout(3500), redirect: 'error' });
      body = await response.text();
    } catch (_) {
      throw new AppError('无法连接 vMix，请检查软件与 Web API 端口', 502);
    }
    if (!response.ok || /^\s*(error|failed)/i.test(body))
      throw new AppError('vMix 拒绝操作：' + body.slice(0, 200), 502);
    return body;
  }
  const server = createServer({
    module: stage,
    now,
    stateFile: path.join(dataDirectory, 'state.json'),
    mounts: [
      operatorTheme(project),
      {
        prefix: '/shared/',
        directory: path.join(project, 'ui/shared'),
        files: ['motion-scene.js'],
      },
      {
        prefix: '/stage-controls/',
        directory: path.join(project, 'ui/control'),
        files: ['microkit-controls.js', 'match-controls.css', 'vendor/xlsx.full.min.js'],
      },
      {
        prefix: '/stage-roster/',
        directory: path.join(project, 'ui/titles'),
        files: ['broadcast.css'],
      },
      { prefix: '/stage/', directory: path.join(project, 'ui/stage') },
      { prefix: mediaPrefix, directory: designDirectory },
      {
        prefix: '/stage-module/',
        directory: path.join(project, 'modules/stage'),
        files: ['captions.js', 'promotion-layout.js'],
      },
    ],
    landingPage: '/stage/control.html',
    async route(req, res, pathname, app) {
      application = app;
      // Writes and filesystem operations accept same-origin clients only.
      if (
        (req.headers.origin &&
          req.headers.origin !== 'http://' + req.headers.host &&
          req.method !== 'GET') ||
        (!['GET', 'HEAD'].includes(req.method) &&
          !['127.0.0.1:' + req.socket.localPort, 'localhost:' + req.socket.localPort].includes(
            req.headers.host,
          ))
      )
        throw new AppError('来源不允许', 403);
      const command = pathname.match(/^\/api\/v1\/commands\/(.+)$/)?.[1];
      if (playCommands.has(command)) {
        method(req, 'POST');
        const payload = await readObject(req, 8192, true);
        if (command === 'award.take' && req.headers['if-match'] &&
          req.headers['if-match'] !== application.snapshot().etag)
          throw new AppError('颁奖设置已在其他窗口更新，请检查后重试', 409);
        const status = await play(command, payload);
        json(res, { ok: true, command, status });
        return true;
      }
      if (
        req.method === 'POST' &&
        (pathname === '/api/v1/state' || /^\/state(?:\.json)?\/?$/.test(pathname))
      ) {
        const patch = await readObject(req);
        if (Object.hasOwn(patch, 'stageDesigns')) throw new AppError('请通过设计模板导入接口保存');
        const current = application.read();
        if (req.headers['if-match'] && req.headers['if-match'] !== application.snapshot().etag)
          throw new AppError('内容已在其他窗口更新，请检查修改后重试', 409);
        if (Object.hasOwn(patch, '_command') || Object.hasOwn(patch, 'payload'))
          throw new AppError('请使用播出控制接口');
        if (patch.layers && Object.hasOwn(patch.layers, 'caption')) {
          network.requireControl();
          if (current.vmix.captionMode || busy) throw new AppError('请使用逐句字幕控制', 409);
        }
        if (
          patch.vmix &&
          Object.entries(patch.vmix).some(([key, value]) => current.vmix[key] !== value)
        ) {
          network.requireControl();
          if (busy || nativeLive?.visible || nativeLive?.uncertain)
            throw new AppError('请先确认 GT 字幕已下屏，再修改连接设置', 409);
          if (patch.vmix.captionMode === true && current.layers.caption)
            patch.layers = { ...patch.layers, caption: false };
        }
        const status = application.update(patch);
        if (
          patch.vmix &&
          Object.entries(patch.vmix).some(([key, value]) => current.vmix[key] !== value)
        )
          nativeLive = null;
        json(
          res,
          pathname === '/api/v1/state'
            ? { ok: true, status }
            : { ok: true, score: status.score, onfield: status.onfield, controls: status.controls },
        );
        return true;
      }
      if (pathname.startsWith('/assets/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('use GET', 405);
        await library.serve(req, res, pathname.slice(8));
        return true;
      }
      if (!pathname.startsWith('/api/stage/')) return false;
      res.setHeader('Cache-Control', 'no-store');
      if (pathname === '/api/stage/collaboration') {
        if (
          (req.headers.host !== '127.0.0.1:' + req.socket.localPort &&
            req.headers.host !== 'localhost:' + req.socket.localPort) ||
          (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        )
          throw new AppError('请在导播主机操作', 403);
        if (req.method !== 'GET') {
          method(req, 'POST');
          const payload = await readObject(req, 131072);
          if (payload.action === 'open') {
            if (stopped) throw new AppError('舞台工作区正在退出', 409);
            await network.open(payload.address);
          } else if (payload.action === 'stop') {
            if (busy) throw new AppError('正在执行播出操作，请稍后关闭协作', 409);
            await network.stop();
          } else if (payload.action === 'control') network.control('host', payload.target);
          else await collaborate(payload.action, payload);
        }
        json(res, { ok: true, ...collaboration('host') });
      } else if (pathname === '/api/stage/award') {
        method(req, 'GET');
        const cue = application.status().awardOnAir;
        sendSnapshot(req, res, {
          body: JSON.stringify({ cue }),
          etag: cue ? '"award-' + cue.startedAt + '-' + cue.exitAt + '"' : '"award-off"',
        });
      } else if (pathname === '/api/stage/promotion-preview') {
        method(req, 'GET');
        const state = application.read();
        const params = new URL(req.url, 'http://local').searchParams;
        const defaultRound = state.promotionRoundId ?? undefined;
        if (params.has('choices')) {
          const rounds = new Map(state.rounds.map(({ id, name }) => [id, name]));
          json(res, {
            rounds: state.promotions.map(({ id }) => ({ id, name: rounds.get(id) || '未分轮' })),
            defaultRound,
          });
        } else {
          const roundId = params.get('round') ?? defaultRound;
          const draft = state.promotions.find(({ id }) => id === roundId);
          const live = draft ? promotionSnapshot(draft) : null;
          const body = JSON.stringify(
            params.has('layout') ? promotionResponse(state, live, true) : live,
          );
          sendSnapshot(req, res, {
            body,
            etag: '"' + createHash('sha256').update(body).digest('hex') + '"',
          });
        }
      } else if (pathname === '/api/stage/promotion') {
        method(req, 'GET');
        const state = application.read();
        const params = new URL(req.url, 'http://local').searchParams;
        const live = currentPromotion(state);
        const body = JSON.stringify(params.has('layout') ? promotionResponse(state, live) : live);
        sendSnapshot(req, res, {
          body,
          etag: '"' + createHash('sha256').update(body).digest('hex') + '"',
        });
      } else if (pathname === '/api/stage/design-templates/validate') {
        method(req, 'POST');
        const template = await readDesign(req);
        json(res, { ok: true, template });
      } else if (pathname === '/api/stage/design-templates') {
        if (req.method === 'GET') {
          const { stageDesigns } = application.read();
          json(res, {
            ok: true,
            templates: stageDesigns.map(({ id, name, slot, scene, revision }) => ({
              id,
              name,
              slot,
              scene,
              revision,
            })),
          });
        } else {
          method(req, 'POST');
          const template = await readDesign(req);
          const replace = new URL(req.url, 'http://local').searchParams.get('replace') === '1';
          const { stageDesigns, captionTemplates } = application.read();
          const prior = stageDesigns.find(({ id }) => id === template.id);
          const caption = captionTemplates.find(({ id }) => id === template.id);
          if (req.headers['if-match'] && (!prior || req.headers['if-match'] !== designEtag(prior)))
            throw new AppError('设计模板已在其他窗口更新，请重新打开', 409);
          if (
            (prior && (!replace || prior.slot !== template.slot)) ||
            (template.slot === 'caption' && caption && caption.designId !== template.id)
          )
            throw new AppError('模板标识已存在，请更新同类型模板或更换标识', 409);
          if (
            (!prior && stageDesigns.length >= 60) ||
            (template.slot === 'caption' && !caption && captionTemplates.length >= 100)
          )
            throw new AppError('模板库已满');
          const stored = designAssets.import({ ...template, revision: (prior?.revision ?? 0) + 1 });
          application.update({
            stageDesigns: [...stageDesigns.filter(({ id }) => id !== stored.id), stored],
            ...(stored.slot === 'caption' && {
              captionTemplates: [
                ...captionTemplates.filter(({ id }) => id !== stored.id),
                captionLink(stored, caption),
              ],
            }),
          });
          json(res, { ok: true, template: stored }, prior ? 200 : 201);
        }
      } else if (pathname.startsWith('/api/stage/design-templates/')) {
        method(req, 'GET');
        const { stageDesigns, captionTemplates } = application.read();
        const id = pathname.slice('/api/stage/design-templates/'.length);
        const design = stageDesigns.find((item) => item.id === id);
        if (!design) throw new AppError('找不到设计模板', 404);
        res.setHeader('ETag', designEtag(design));
        const position =
          design.slot === 'caption'
            ? captionTemplates.find(({ designId }) => designId === id)?.position
            : undefined;
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="' + id + '.vmix-graphics.json"',
        );
        json(res, designAssets.export(design, position));
      } else if (pathname === '/api/stage/templates') {
        method(req, 'GET');
        json(res, { ok: true, templates });
      } else if (pathname === '/api/stage/caption-package') {
        if (req.method === 'POST') {
          const template = await library.captionPackages.import(req, (imported) => {
            application.update({
              captionTemplates: [...application.read().captionTemplates, imported],
            });
            return imported;
          });
          json(res, { ok: true, template });
        } else {
          if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('请求方法无效', 405);
          const localHost = ['127.0.0.1:', 'localhost:'].some(
            (host) => req.headers.host === host + req.socket.localPort,
          );
          if (!localHost || req.headers['sec-fetch-site'] === 'cross-site')
            throw new AppError('请在导播主机导出字幕模板', 403);
          let draft;
          try {
            draft = JSON.parse(new URL(req.url, 'http://local').searchParams.get('template'));
          } catch {
            throw new AppError('字幕模板格式无效');
          }
          await library.captionPackages.export(req, res, draft);
        }
      } else if (pathname === '/api/stage/library') {
        method(req, 'GET');
        json(res, { ok: true, assets: library.list() });
      } else if (pathname === '/api/stage/folder') {
        method(req, 'POST');
        const payload = await readObject(req, 8192);
        json(res, {
          ok: true,
          ...(payload.folder ? library.browse(payload.folder) : library.openFolder(payload.path)),
        });
      } else if (pathname === '/api/stage/asset-link') {
        method(req, 'POST');
        json(res, { ok: true, asset: library.pin((await readObject(req, 4096)).id) });
      } else if (pathname === '/api/stage/upload') {
        method(req, 'POST');
        const name = new URL(req.url, 'http://local').searchParams.get('name') || '';
        json(res, { ok: true, asset: await library.upload(req, name) });
      } else if (pathname === '/api/stage/media') {
        method(req, 'POST');
        const query = new URL(req.url, 'http://local').searchParams;
        const fps = query.has('fps') ? Number(query.get('fps')) : null;
        json(res, {
          ok: true,
          asset: await library.importMedia(req, res, query.get('name') || '', fps),
        });
      } else if (pathname === '/api/stage/register') {
        method(req, 'POST');
        json(res, { ok: true, asset: library.register((await readObject(req, 8192)).path) });
      } else if (pathname === '/api/stage/render') {
        if (req.method === 'GET') json(res, { ok: true, jobs: library.jobs() });
        else {
          method(req, 'POST');
          json(res, { ok: true, job: library.renderAE(await readObject(req, 8192)) });
        }
      } else if (pathname === '/api/stage/vmix') {
        method(req, 'POST');
        const payload = await readObject(req, 8192);
        const state = application.read();
        await exclusive(async () => {
          if (state.vmix.captionMode && ['text', 'show'].includes(payload.action))
            throw new AppError('GT 字幕模式下请使用逐句字幕控制');
          if (payload.action === 'connect') {
            await vmix(state, {});
          } else if (payload.action === 'add') {
            const entry = library.get(payload.id);
            const type = { gt: 'Title', image: 'Image', video: 'Video' }[entry.kind];
            if (!type || /\.(?:alpha\.mp4|frames\.json)$/.test(entry.file))
              throw new AppError('请使用原始媒体文件或舞台网页输入');
            await vmix(state, {
              Function: 'AddInput',
              Value: type + '|' + library.filename(entry),
            });
          } else if (payload.action === 'text') {
            if (!state.vmix.input || !state.live)
              throw new AppError('请先播出节目并填写 GT 输入名或编号');
            await vmix(state, {
              Function: 'SetText',
              Input: state.vmix.input,
              SelectedName: state.vmix.titleField,
              Value: state.live.title,
            });
            try {
              await vmix(state, {
                Function: 'SetText',
                Input: state.vmix.input,
                SelectedName: state.vmix.subtitleField,
                Value: [state.live.performer, state.live.subtitle].filter(Boolean).join(' · '),
              });
            } catch (error) {
              throw new AppError('主标题已同步，副标题同步失败：' + error.message, 502);
            }
          } else if (['show', 'hide'].includes(payload.action)) {
            if (!state.vmix.input) throw new AppError('请填写 GT 输入名或编号');
            if (payload.action === 'show') manualOverlay = true;
            await overlay(state, payload.action === 'show');
            if (payload.action === 'hide') manualOverlay = false;
            if (state.vmix.captionMode)
              nativeLive = {
                ...nativeLive,
                visible: false,
                uncertain: false,
                operator: '导播主机',
              };
          } else if (payload.action === 'animate') {
            if (!state.vmix.input || !state.vmix.animation)
              throw new AppError('请填写 GT 输入与动画名称');
            await vmix(state, {
              Function: 'TitleBeginAnimation',
              Input: state.vmix.input,
              Value: state.vmix.animation,
            });
          } else if (payload.action === 'layer') {
            if (
              !state.vmix.input ||
              !Number.isInteger(payload.layer) ||
              payload.layer < 1 ||
              payload.layer > 10 ||
              typeof payload.source !== 'string' ||
              !payload.source.trim() ||
              payload.source.length > 200 ||
              payload.source.includes(',')
            )
              throw new AppError('请输入有效的 GT 输入、图层编号与来源输入');
            await vmix(state, {
              Function: 'SetLayer',
              Input: state.vmix.input,
              Value: payload.layer + ',' + payload.source.trim(),
            });
          } else throw new AppError('未知的 vMix 操作');
        });
        json(res, { ok: true });
      } else throw new AppError('找不到接口', 404);
      return true;
    },
  });
  server.pauseClocks = () => {
    stopped = true;
    void network.stop();
  };
  server.on('listening', () => {
    const state = server.workspaceState();
    library.prewarm([
      state.eventAsset,
      state.channelAsset,
      state.captionLive?.template?.background,
      state.live?.announcementAsset,
      ...state.captionTemplates.map((item) => item.background),
      ...state.programs.map((item) => item.announcementAsset),
      ...state.promotions.map((item) => item.background),
    ]);
  });
  server.on('close', () => {
    stopped = true;
    void network.stop();
    library.close();
  });
  server.workspacePromotionLayout = () => promotionLayout(server.workspaceState());
  server.workspaceCaptionLayout = (target) => {
    const state = server.workspaceState();
    const automatic = layoutTemplate(state);
    const entry =
      target === undefined ? automatic : state.captionTemplates.find(({ id }) => id === target);
    if (target && !entry) throw new AppError('找不到所选字幕模板', 404);
    const stored = state.captionTemplates.find(({ id }) => id === entry?.id);
    const position = stored?.position;
    return {
      captionX: position?.x ?? state.style.captionX,
      captionY: position?.y ?? state.style.captionY,
      captionTemplateId: stored?.id || '',
      captionChoices: state.captionTemplates.map(({ id, name }) => ({ id, name })),
    };
  };
  server.checkVmixPortChange = () => {
    if (busy || nativeLive?.visible || nativeLive?.uncertain || manualOverlay)
      throw new AppError('请先撤下 GT 字幕，再更改共用端口', 409);
  };
  return server;
}
module.exports = { createStageServer };
