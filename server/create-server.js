'use strict';

const http = require('node:http');
const { createApplication } = require('../core/application');
const { AppError } = require('../core/errors');
const { cors, json } = require('./http-utils');
const { routeAPI } = require('./api');
const { routeLegacy } = require('./legacy-api');
const { createStaticHandler } = require('./static-files');

function createServer({
  module: extension,
  stateFile,
  mounts = [],
  publicFiles = {},
  landingPage = '/api/v1/module',
  now,
  logger = console,
}) {
  const application = createApplication({ module: extension, stateFile, now });
  const serveStatic = createStaticHandler(mounts);
  let advanceFailed = false;

  function advance() {
    try {
      application.advance();
      advanceFailed = false;
    } catch (error) {
      if (!advanceFailed) logger.error('Automatic state save failed:', error.message);
      advanceFailed = true;
    }
  }

  const server = http.createServer(async (req, res) => {
    cors(res);
    try {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch (_) {
        throw new AppError('invalid URL');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (Object.hasOwn(publicFiles, pathname)) {
        if (req.method !== 'GET') throw new AppError('use GET', 405, 'METHOD_NOT_ALLOWED');
        const file = publicFiles[pathname];
        res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
        res.end(file.body);
        return;
      }
      if (pathname.startsWith('/api/') || /^\/state(\.json)?\/?$/.test(pathname)) advance();
      if (await routeAPI(req, res, pathname, application)) return;
      if (await routeLegacy(req, res, pathname, application, extension.legacyCatalog)) return;
      if (pathname.startsWith('/api/')) throw new AppError('unknown API route', 404, 'NOT_FOUND');
      if (pathname === '/') {
        res.writeHead(302, { Location: landingPage });
        res.end();
        return;
      }
      await serveStatic(req, res, pathname);
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) logger.error('Request failed:', error.message);
      json(
        res,
        {
          ok: false,
          error: status === 500 && !(error instanceof AppError) ? 'request failed' : error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        status,
      );
    }
  });

  server.pauseClocks = () => application.pause();
  let timer;
  server.on('listening', () => {
    timer = setInterval(advance, 200);
    timer.unref();
  });
  server.on('close', () => clearInterval(timer));
  return server;
}

module.exports = { createServer };
