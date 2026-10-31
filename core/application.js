'use strict';

const { AppError } = require('./errors');
const { createStateStore, assertObject } = require('./state-store');

/**
 * A module owns its rules; the application owns transactions and persistence.
 * All module hooks are synchronous and must return JSON-serializable objects.
 * @param {{module: import('./module-contract').BroadcastModule, stateFile: string, now?: () => number}} options
 */
function createApplication({ module: extension, stateFile, now = Date.now }) {
  for (const hook of ['migrate', 'reduce', 'status']) {
    if (typeof extension?.[hook] !== 'function') throw Error('Module requires ' + hook);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(extension.id)) throw Error('Invalid module id');
  const commands = extension.commands || [];
  const byId = new Map();
  for (const entry of commands) {
    if (
      !/^[A-Za-z0-9_.-]+$/.test(entry.id) ||
      byId.has(entry.id) ||
      typeof entry.execute !== 'function'
    ) {
      throw Error('Invalid or duplicate module command: ' + entry.id);
    }
    byId.set(entry.id, entry);
  }
  const store = createStateStore({ stateFile, migrate: extension.migrate, now });

  function validate(reduce) {
    try {
      return reduce();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error.message);
    }
  }

  function update(patch) {
    assertObject(patch);
    store.transact((state) => validate(() => extension.reduce(state, patch, now())));
    return status();
  }

  function execute(id, payload = {}) {
    assertObject(payload);
    const entry = byId.get(id);
    if (!entry) throw new AppError('unknown command', 404, 'UNKNOWN_COMMAND');
    store.transact((state) =>
      validate(() => {
        const time = now();
        const patch = entry.execute(state, payload, time);
        assertObject(patch);
        return extension.reduce(state, patch, time);
      }),
    );
    return status();
  }

  function status() {
    return store.project((state) => extension.status(state, now()));
  }

  return {
    describe: () => ({
      id: extension.id,
      name: extension.name,
      apiVersion: 1,
      capabilities: extension.capabilities || [],
    }),
    commands: () => commands.map(({ execute: ignored, ...entry }) => entry),
    read: store.read,
    snapshot: store.snapshot,
    update,
    execute,
    status,
    advance() {
      if (extension.advance) store.transact((state) => extension.advance(state, now()));
    },
    pause() {
      if (extension.pause) store.transact((state) => extension.pause(state, now()));
    },
  };
}

module.exports = { createApplication };
