'use strict';

const { AppError } = require('../core/errors');
const { json, readObject, method, sendSnapshot } = require('./http-utils');

// Existing control pages, vMix URLs and D200 buttons keep their original contract.
async function routeLegacy(req, res, pathname, application, catalog) {
  if (/^\/state(\.json)?\/?$/.test(pathname)) {
    if (req.method === 'GET') sendSnapshot(req, res, application.snapshot());
    else {
      method(req, 'POST');
      const status = application.update(await readObject(req));
      json(res, {
        ok: true,
        score: status.score,
        onfield: status.onfield,
        controls: status.controls,
      });
    }
    return true;
  }
  if (!catalog || !pathname.startsWith('/api/d200/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/d200/actions' || pathname === '/api/d200/status') {
    method(req, 'GET');
    json(res, pathname.endsWith('/status') ? application.status() : { ok: true, ...catalog });
    return true;
  }
  const match = pathname.match(/^\/api\/d200\/action\/([A-Za-z0-9_]+)$/);
  if (!match || !catalog.actions.some((action) => action.id === match[1])) {
    throw new AppError('unknown D200 action', 404, 'UNKNOWN_COMMAND');
  }
  method(req, 'POST');
  req.resume();
  json(res, { ok: true, action: match[1], status: application.execute(match[1]) });
  return true;
}

module.exports = { routeLegacy };
