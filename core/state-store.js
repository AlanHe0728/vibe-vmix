'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { AppError } = require('./errors');

function assertObject(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new AppError('expected object');
  }
}

function serialize(state) {
  assertObject(state);
  const body = Buffer.from(JSON.stringify(state), 'utf8');
  const etag = '"' + crypto.createHash('sha256').update(body).digest('hex') + '"';
  return { body, etag };
}

function freeze(state) {
  if (state && typeof state === 'object' && !Object.isFrozen(state)) {
    for (const value of Object.values(state)) freeze(value);
    Object.freeze(state);
  }
  return state;
}

function createStateStore({ stateFile, migrate, now = Date.now }) {
  // A corrupt file is an error. Never silently overwrite the user's data.
  const saved = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, ''))
    : {};
  assertObject(saved);
  let state = freeze(migrate(saved, now()));
  let cached = serialize(state);

  function transact(reduce) {
    // Read-only input prevents partial mutations without copying embedded images on every timer tick.
    const next = reduce(state);
    if (next === null) return false;
    assertObject(next);
    const owned = freeze(structuredClone(next));
    const prepared = serialize(owned);
    const temporary = stateFile + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(owned, null, 2), 'utf8');
      fs.renameSync(temporary, stateFile);
    } catch (cause) {
      try {
        fs.unlinkSync(temporary);
      } catch (_) {
        /* Keep the original error. */
      }
      throw new AppError('保存失败，请检查文件权限和磁盘空间', 500, 'SAVE_FAILED');
    }
    state = owned;
    cached = prepared;
    return true;
  }

  return {
    read: () => structuredClone(state),
    project: (reader) => reader(state),
    snapshot: () => {
      const snapshot = cached;
      // Conditional polling reads only ETag; a 304 never copies megabytes of embedded assets.
      return {
        etag: snapshot.etag,
        get body() {
          return Buffer.from(snapshot.body);
        },
      };
    },
    transact,
  };
}

module.exports = { createStateStore, assertObject };
