'use strict';

const { AppError } = require('../core/errors');
const { json, readObject, method, sendSnapshot } = require('./http-utils');

async function routeAPI(req, res, pathname, application) {
  if (!pathname.startsWith('/api/v1/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  switch (pathname) {
    case '/api/v1/module':
      method(req, 'GET');
      json(res, { ok: true, module: application.describe() });
      break;
    case '/api/v1/commands':
      method(req, 'GET');
      json(res, { ok: true, commands: application.commands() });
      break;
    case '/api/v1/status':
      method(req, 'GET');
      json(res, { ok: true, status: application.status() });
      break;
    case '/api/v1/state':
      if (req.method === 'GET') sendSnapshot(req, res, application.snapshot());
      else {
        method(req, 'POST');
        const patch = await readObject(req);
        json(res, { ok: true, status: application.update(patch) });
      }
      break;
    default: {
      const match = pathname.match(/^\/api\/v1\/commands\/([A-Za-z0-9_.-]+)$/);
      if (!match) throw new AppError('unknown API route', 404, 'NOT_FOUND');
      method(req, 'POST');
      const payload = await readObject(req, undefined, true);
      json(res, { ok: true, command: match[1], status: application.execute(match[1], payload) });
    }
  }
  return true;
}

module.exports = { routeAPI };
