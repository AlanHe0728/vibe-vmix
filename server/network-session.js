'use strict';

const http = require('node:http');
const { networkInterfaces } = require('node:os');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { AppError } = require('../core/errors');
const { json, readObject, method } = require('./http-utils');
const { closeLocal } = require('./listen-local');

function addresses() {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter(
          (entry) =>
            entry.family === 'IPv4' &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(entry.address),
        )
        .map((entry) => entry.address),
    ),
  ].sort((a, b) => Number(a.startsWith('169.254.')) - Number(b.startsWith('169.254.')));
}

function createNetworkSession({ serve, dispatch, busy }) {
  const clients = new Map();
  let listener,
    host,
    code,
    owner,
    pending = false;
  const lease = 45000;

  function prune() {
    const cutoff = Date.now() - lease;
    for (const [token, client] of clients)
      if (client.seen < cutoff && !(busy() && owner === token)) clients.delete(token);
    if (owner !== 'host' && !clients.has(owner)) owner = null;
  }

  function status(actor = 'host') {
    prune();
    return {
      active: Boolean(listener?.listening),
      owner: owner === 'host' ? '导播主机' : clients.get(owner)?.name || '',
      owns: owner === actor,
      clients: [...clients].map(([id, client]) => ({
        id: client.id,
        name: client.name,
        owns: id === owner,
      })),
      ...(actor === 'host' && {
        addresses: addresses(),
        ...(listener?.listening && { url: 'http://' + host + '/collab', code }),
      }),
    };
  }

  function requireControl(actor = 'host') {
    prune();
    if ((listener?.listening || pending) && owner !== actor)
      throw new AppError('请先取得叠加通道控制权', 409);
  }

  function control(actor, target) {
    prune();
    if (busy() || pending) throw new AppError('正在执行播出操作，请稍后交接', 409);
    if (target === 'claim') {
      if (actor !== 'host' && owner && owner !== actor)
        throw new AppError('请由当前操作员交接或释放控制权', 409);
      owner = actor;
    } else {
      requireControl(actor);
      const next = [...clients].find(([, client]) => client.id === target);
      if (target !== 'release' && target !== 'host' && !next)
        throw new AppError('该操作员已离线', 409);
      owner = next?.[0] || (target === 'host' ? 'host' : null);
    }
  }

  async function handle(req, res, server) {
    try {
      if (
        req.headers.host !== host ||
        (req.headers.origin && req.headers.origin !== 'http://' + host)
      )
        throw new AppError('来源不允许', 403);
      const pathname = new URL(req.url, 'http://' + host).pathname;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      if (!pathname.startsWith('/api/collaboration/')) return await serve(req, res, pathname);
      prune();
      const action = pathname.slice('/api/collaboration/'.length);
      if (action === 'join') {
        method(req, 'POST');
        const input = await readObject(req, 4096);
        if (listener !== server) throw new AppError('协作会话已结束', 401);
        const supplied = Buffer.from(
          typeof input.code === 'string' ? input.code.trim().toUpperCase() : '',
        );
        const expected = Buffer.from(code || '');
        if (
          supplied.length !== expected.length ||
          !expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          throw new AppError('加入码无效，请向导播主机获取当前加入码', 403);
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 24)
          throw new AppError('请输入 1 至 24 字的操作员姓名');
        if (clients.size >= 20) throw new AppError('协作者已满，请稍后加入', 409);
        const token = randomBytes(24).toString('hex');
        clients.set(token, {
          id: randomBytes(8).toString('hex'),
          name: input.name.trim(),
          seen: Date.now(),
        });
        return json(res, { ok: true, token });
      }
      const actor = req.headers.authorization?.slice('Bearer '.length);
      const client = clients.get(actor);
      if (!client || req.headers.authorization !== 'Bearer ' + actor)
        throw new AppError('协作会话已结束，请重新加入', 401);
      client.seen = Date.now();
      if (action === 'leave') {
        method(req, 'POST');
        if (owner === actor && busy()) throw new AppError('正在执行播出操作，请稍后退出', 409);
        clients.delete(actor);
        if (owner === actor) owner = null;
        return json(res, { ok: true });
      }
      if (action === 'control') {
        method(req, 'POST');
        const { target } = await readObject(req, 4096);
        if (!clients.has(actor)) throw new AppError('协作会话已结束', 401);
        control(actor, target);
        return json(res, { ok: true, session: status(actor) });
      }
      const input = req.method === 'POST' ? await readObject(req, 128 * 1024) : undefined;
      if (!clients.has(actor)) throw new AppError('协作会话已结束', 401);
      await dispatch(req, res, action, actor, client.name, input);
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        json(
          res,
          { ok: false, error: error instanceof AppError ? error.message : '协作请求失败' },
          error.status || 500,
        );
      else if (!res.writableEnded) res.destroy();
    }
  }

  async function open(address) {
    if (pending || busy()) throw new AppError('正在执行操作，请稍后开启协作', 409);
    if (listener?.listening) return;
    if (!addresses().includes(address)) throw new AppError('请选择本机的局域网地址');
    pending = true;
    owner = 'host';
    code = randomBytes(6).toString('hex').toUpperCase();
    const server = http.createServer((req, res) => handle(req, res, server));
    listener = server;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, address, () => {
          host = address + ':' + server.address().port;
          server.off('error', reject);
          resolve();
        });
      });
    } catch {
      listener = null;
      throw new AppError('无法开放局域网协作，请检查网络地址', 502);
    } finally {
      pending = false;
    }
  }

  async function stop() {
    const server = listener;
    if (pending && server)
      await new Promise((resolve) => {
        server.once('listening', resolve);
        server.once('error', resolve);
      });
    listener = null;
    host = code = owner = null;
    clients.clear();
    if (server) await closeLocal(server);
  }

  return { open, stop, status, requireControl, control };
}

module.exports = { createNetworkSession };
