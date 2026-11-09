'use strict';
const path = require('node:path');
const { createServer } = require('./create-server');
const { createStageModule } = require('../modules/stage');
const { templates } = require('../modules/stage/templates');
const { createAssetLibrary } = require('./stage-assets');
const { json, readObject, method } = require('./http-utils');
const { AppError } = require('../core/errors');

function createStageServer({
  dataDirectory,
  project = path.resolve(__dirname, '..'),
  vmixFetch = fetch,
}) {
  const library = createAssetLibrary(path.join(dataDirectory, 'assets'));
  async function vmix(state, params) {
    const url = new URL('http://127.0.0.1:' + state.vmix.port + '/api/');
    url.search = new URLSearchParams(params).toString();
    let response;
    try {
      response = await vmixFetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (_) {
      throw new AppError('无法连接 vMix，请检查软件与 Web API 端口', 502);
    }
    const body = await response.text();
    if (!response.ok || /^\s*(error|failed)/i.test(body))
      throw new AppError('vMix 拒绝操作：' + body.slice(0, 200), 502);
    return body;
  }
  const server = createServer({
    module: createStageModule(),
    stateFile: path.join(dataDirectory, 'state.json'),
    mounts: [
      { prefix: '/stage/', directory: path.join(project, 'ui/stage') },
      { prefix: '/stage-module/', directory: path.join(project, 'modules/stage'), files: ['captions.js'] },
    ],
    landingPage: '/stage/control.html',
    async route(req, res, pathname, application) {
      // Writes and filesystem operations accept same-origin clients only.
      if (
        req.headers.origin &&
        req.headers.origin !== 'http://' + req.headers.host &&
        req.method !== 'GET'
      )
        throw new AppError('来源不允许', 403);
      if (pathname.startsWith('/assets/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('use GET', 405);
        await library.serve(req, res, pathname.slice(8));
        return true;
      }
      if (!pathname.startsWith('/api/stage/')) return false;
      res.setHeader('Cache-Control', 'no-store');
      if (pathname === '/api/stage/templates') {
        method(req, 'GET');
        json(res, { ok: true, templates });
      } else if (pathname === '/api/stage/library') {
        method(req, 'GET');
        json(res, { ok: true, assets: library.list() });
      } else if (pathname === '/api/stage/upload') {
        method(req, 'POST');
        const name = new URL(req.url, 'http://local').searchParams.get('name') || '';
        json(res, { ok: true, asset: await library.upload(req, name) });
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
        if (payload.action === 'connect') {
          await vmix(state, {});
        } else if (payload.action === 'add') {
          const entry = library.get(payload.id);
          const type = { gt: 'Title', image: 'Image', video: 'Video' }[entry.kind];
          if (!type) throw new AppError('请先在原软件导出视频，再将视频添加到 vMix');
          await vmix(state, { Function: 'AddInput', Value: type + '|' + library.filename(entry) });
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
          await vmix(state, {
            Function:
              'OverlayInput' + state.vmix.overlay + (payload.action === 'show' ? 'In' : 'Out'),
            Input: state.vmix.input,
          });
        } else throw new AppError('未知的 vMix 操作');
        json(res, { ok: true });
      } else throw new AppError('找不到接口', 404);
      return true;
    },
  });
  server.on('close', () => library.close());
  return server;
}
module.exports = { createStageServer };
