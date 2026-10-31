'use strict';

const { AppError } = require('../core/errors');
const { assertObject } = require('../core/state-store');

function json(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
}

async function readObject(req, limit = 32 * 1024 * 1024, allowEmpty = false) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  if (size > limit) throw new AppError('upload exceeds 32 MB', 413, 'BODY_TOO_LARGE');
  if (size === 0 && allowEmpty) return {};
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) {
    throw new AppError('invalid JSON');
  }
  assertObject(value);
  return value;
}

function method(req, expected) {
  if (req.method !== expected) throw new AppError('use ' + expected, 405, 'METHOD_NOT_ALLOWED');
}

function sendSnapshot(req, res, snapshot) {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', snapshot.etag);
  if (req.headers['if-none-match'] === snapshot.etag) {
    res.writeHead(304);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(snapshot.body);
}

module.exports = { json, cors, readObject, method, sendSnapshot };
