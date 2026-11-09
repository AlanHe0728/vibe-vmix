'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStaticHandler } = require('./static-files');
const { json, readObject, method } = require('./http-utils');
const { AppError } = require('../core/errors');
const { validateCommand } = require('../modules/ae-live/commands');

function createAELiveServer({
  dataDirectory,
  project = path.resolve(__dirname, '..'),
  vmixFetch = fetch,
}) {
  fs.mkdirSync(path.join(dataDirectory, 'cache'), { recursive: true });
  const tokenFile = path.join(dataDirectory, 'pairing.json');
  const token = fs.existsSync(tokenFile)
    ? JSON.parse(fs.readFileSync(tokenFile, 'utf8')).token
    : crypto.randomBytes(24).toString('hex');
  if (!/^[a-f0-9]{48}$/.test(token))
    throw Error('AE 配对文件损坏，请恢复备份；程序不会覆盖现有密钥');
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, JSON.stringify({ token }));
  const settingsFile = path.join(dataDirectory, 'settings.json');
  let settings = fs.existsSync(settingsFile)
    ? JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
    : { port: 8088, input: '', overlay: 1 };
  settings.layout = { x: 0, y: 0, scale: 1, ...settings.layout };
  function saveSettings() {
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings));
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  }
  const clipIndex = path.join(dataDirectory, 'clips.json');
  let clips = fs.existsSync(clipIndex) ? JSON.parse(fs.readFileSync(clipIndex, 'utf8')) : [];
  let session = '',
    lastSeen = 0,
    snapshot = null,
    sequence = 0,
    frameRevision = 0,
    visible = false,
    uploading = false,
    lastFrameAt = 0;
  const queue = [],
    history = [];
  let inFlight = null;
  const mount = createStaticHandler([
    { prefix: '/ae/', directory: path.join(project, 'ui/ae-live') },
  ]);
  const frameFile = path.join(dataDirectory, 'latest.png');
  function connected() {
    return Boolean(session && Date.now() - lastSeen < 15000);
  }
  function publicState() {
    return {
      connected: connected(),
      lastSeen,
      snapshot,
      queue: queue.map((item) => ({ id: item.id, type: item.type })),
      inFlight: inFlight && { id: inFlight.id, type: inFlight.type },
      history: history.slice(-15),
      settings,
      clips: clips.map((clip) => ({
        ...clip,
        available: fs.existsSync(path.join(dataDirectory, 'cache', clip.file)),
      })),
      output: { visible, frameRevision, lastFrameAt },
    };
  }
  function tokenValid(req) {
    const provided = String(req.headers.authorization || '').replace(/^Bearer /, '');
    return (
      provided.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    );
  }
  function record(item, status, message) {
    history.push({
      id: item.id,
      type: item.type,
      status,
      message: String(message || '').slice(0, 500),
      at: Date.now(),
    });
    if (history.length > 40) history.shift();
  }
  function acceptSnapshot(value) {
    if (
      !value?.comp ||
      !Number.isInteger(value.comp.id) ||
      typeof value.comp.name !== 'string' ||
      !Number.isFinite(value.comp.duration) ||
      value.comp.duration <= 0 ||
      !Array.isArray(value.controls) ||
      value.controls.length > 300
    )
      throw new AppError('AE 返回的合成资料无效');
    for (const control of value.controls)
      if (
        typeof control.id !== 'string' ||
        !['text', 'number', 'checkbox', 'color'].includes(control.kind)
      )
        throw new AppError('AE 直播控件无效');
    snapshot = value;
  }
  function enqueue(input) {
    if (!connected()) throw new AppError('AE 插件未连接，请先在 AE 中打开插件并配对', 409);
    let validated;
    try {
      validated = validateCommand(input, snapshot);
    } catch (error) {
      throw new AppError(error.message);
    }
    const item = { ...validated, id: ++sequence, createdAt: Date.now() };
    if (item.type === 'setControl') {
      const index = queue.findIndex(
        (entry) => entry.type === item.type && entry.args.control.id === item.args.control.id,
      );
      if (index >= 0) {
        record(queue[index], 'superseded');
        queue.splice(index, 1);
      }
    }
    if (queue.length >= 50) throw new AppError('AE 操作队列已满，请等待当前操作完成', 429);
    if (
      item.type === 'frame' &&
      (inFlight?.type === 'frame' || queue.some((entry) => entry.type === 'frame'))
    )
      throw new AppError('正在生成画面，请稍后', 409);
    if (item.type === 'renderClip') {
      item.args.output = path.join(
        dataDirectory,
        'cache',
        crypto.randomBytes(16).toString('hex') + '.mov',
      );
    }
    queue.push(item);
    return item;
  }
  function checkSession(body) {
    if (!session || body.session !== session) throw new AppError('连接会话已失效，请重新配对', 409);
    lastSeen = Date.now();
  }
  async function vMix(params) {
    const url = new URL('http://127.0.0.1:' + settings.port + '/api/');
    url.search = new URLSearchParams(params).toString();
    try {
      const response = await vmixFetch(url, { signal: AbortSignal.timeout(5000) });
      const result = await response.text();
      if (!response.ok || /^\s*(error|failed)/i.test(result)) throw Error(result.slice(0, 200));
    } catch (error) {
      throw new AppError('vMix 操作失败：' + error.message, 502);
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local'),
        route = url.pathname;
      const agent = route.startsWith('/api/ae/agent/');
      if (agent && !tokenValid(req)) throw new AppError('配对密钥无效', 401);
      if (!agent && req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)
        throw new AppError('来源不允许', 403);
      res.setHeader('Cache-Control', 'no-store');
      if (route === '/') {
        res.writeHead(302, { Location: '/ae/control.html' });
        res.end();
        return;
      }
      if (route === '/api/ae/state') {
        method(req, 'GET');
        json(res, { ok: true, ...publicState() });
        return;
      }
      if (route === '/api/ae/pairing') {
        method(req, 'GET');
        json(res, { ok: true, token, endpoint: 'http://' + req.headers.host });
        return;
      }
      if (route === '/api/ae/settings') {
        method(req, 'POST');
        const body = await readObject(req, 8192);
        if (
          !Number.isInteger(body.port) ||
          body.port < 1 ||
          body.port > 65535 ||
          !Number.isInteger(body.overlay) ||
          body.overlay < 1 ||
          body.overlay > 4 ||
          typeof body.input !== 'string' ||
          body.input.length > 200
        )
          throw new AppError('vMix 设置无效');
        settings = {
          port: body.port,
          input: body.input,
          overlay: body.overlay,
          layout: settings.layout,
        };
        saveSettings();
        json(res, { ok: true });
        return;
      }
      if (route === '/api/ae/command') {
        method(req, 'POST');
        const item = enqueue(await readObject(req, 16384));
        json(res, { ok: true, command: { id: item.id, type: item.type } });
        return;
      }
      if (route === '/api/ae/clear') {
        method(req, 'POST');
        queue.splice(0).forEach((item) => record(item, 'cancelled'));
        json(res, { ok: true });
        return;
      }
      if (route === '/api/ae/output') {
        if (req.method === 'GET')
          json(res, {
            ok: true,
            ...publicState().output,
            connected: connected(),
            layout: settings.layout,
          });
        else {
          method(req, 'POST');
          const body = await readObject(req, 1024);
          if (typeof body.visible !== 'boolean') throw new AppError('开关无效');
          if (body.visible && !frameRevision) throw new AppError('请先从 AE 生成画面');
          visible = body.visible;
          json(res, { ok: true });
        }
        return;
      }
      if (route === '/frame.png') {
        method(req, 'GET');
        if (!frameRevision || !fs.existsSync(frameFile)) throw new AppError('尚无 AE 画面', 404);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        const stream = fs.createReadStream(frameFile);
        res.on('close', () => stream.destroy());
        stream.on('error', () => res.destroy()).pipe(res);
        return;
      }
      if (route === '/api/ae/agent/hello') {
        method(req, 'POST');
        await readObject(req, 16384);
        queue
          .splice(0)
          .forEach((item) => record(item, 'cancelled', '插件重新连接，避免重放旧操作'));
        if (inFlight) record(inFlight, 'uncertain', '连接重建，请在 AE 检查操作结果');
        inFlight = null;
        snapshot = null;
        session = crypto.randomBytes(16).toString('hex');
        lastSeen = Date.now();
        json(res, { ok: true, session });
        return;
      }
      if (route === '/api/ae/agent/poll') {
        method(req, 'POST');
        const body = await readObject(req, 2 * 1024 * 1024);
        checkSession(body);
        if (body.snapshot) acceptSnapshot(body.snapshot);
        // No automatic retries of uncertain host mutations after reconnect.
        if (!inFlight && queue.length) inFlight = queue.shift();
        json(res, { ok: true, command: inFlight });
        return;
      }
      if (route === '/api/ae/agent/result') {
        method(req, 'POST');
        const body = await readObject(req, 2 * 1024 * 1024);
        checkSession(body);
        if (!inFlight || body.id !== inFlight.id) {
          if (history.some((entry) => entry.id === body.id)) {
            json(res, { ok: true, duplicate: true });
            return;
          }
          throw new AppError('操作编号已失效', 409);
        }
        const item = inFlight;
        if (body.ok === true && body.snapshot) {
          acceptSnapshot(body.snapshot);
        }
        if (body.ok === true && item.type === 'renderClip') {
          if (!fs.existsSync(item.args.output) || fs.statSync(item.args.output).size === 0) {
            record(item, 'failed', 'AE 未生成动画缓存');
            inFlight = null;
            json(res, { ok: true, resultStatus: 'failed' });
            return;
          }
          const clip = {
            id: crypto.randomBytes(8).toString('hex'),
            name: snapshot?.comp?.name || 'AE 动画',
            file: path.basename(item.args.output),
            createdAt: Date.now(),
          };
          const next = [...clips, clip];
          fs.writeFileSync(clipIndex + '.tmp', JSON.stringify(next));
          fs.renameSync(clipIndex + '.tmp', clipIndex);
          clips = next;
        }
        record(item, body.ok === true ? 'done' : 'failed', body.error);
        inFlight = null;
        json(res, { ok: true });
        return;
      }
      if (route === '/api/ae/agent/frame') {
        method(req, 'POST');
        checkSession({ session: url.searchParams.get('session') });
        if (uploading) throw new AppError('正在接收画面', 409);
        uploading = true;
        try {
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 32 * 1024 * 1024) throw new AppError('AE 画面超过 32 MB', 413);
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          if (
            buffer.length < 24 ||
            !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            throw new AppError('需要 PNG 画面');
          fs.writeFileSync(frameFile + '.tmp', buffer);
          fs.renameSync(frameFile + '.tmp', frameFile);
          frameRevision++;
          lastFrameAt = Date.now();
          json(res, { ok: true, frameRevision });
        } finally {
          uploading = false;
        }
        return;
      }
      if (route === '/api/ae/vmix') {
        method(req, 'POST');
        const body = await readObject(req, 8192);
        if (body.action === 'add') {
          const clip = clips.find((item) => item.id === body.id);
          if (!clip) throw new AppError('动画缓存不存在');
          await vMix({
            Function: 'AddInput',
            Value: 'Video|' + path.join(dataDirectory, 'cache', clip.file),
          });
        } else {
          if (!settings.input) throw new AppError('请填写 vMix 动画输入名或编号');
          const functions = {
            play: 'Play',
            pause: 'Pause',
            restart: 'Restart',
            loop: 'LoopOn',
            unloop: 'LoopOff',
            show: 'OverlayInput' + settings.overlay + 'In',
            hide: 'OverlayInput' + settings.overlay + 'Out',
          };
          if (!functions[body.action]) throw new AppError('未知播放操作');
          await vMix({ Function: functions[body.action], Input: settings.input });
        }
        json(res, { ok: true });
        return;
      }
      await mount(req, res, decodeURIComponent(route));
    } catch (error) {
      if (!res.destroyed && !res.headersSent)
        json(res, { ok: false, error: error.message }, error.status || 500);
    }
  });
  server.pauseClocks = () => {
    visible = false;
    queue.length = 0;
    session = '';
  };
  server.workspaceLayout = () => ({ ...settings.layout });
  server.workspaceSetLayout = (layout) => {
    settings = { ...settings, layout };
    saveSettings();
  };
  return server;
}
module.exports = { createAELiveServer };
