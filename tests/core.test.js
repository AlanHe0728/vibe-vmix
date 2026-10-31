'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApplication } = require('../core/application');
const { createServer } = require('../server/create-server');
const { createFootballModule } = require('../modules/football');
const { createStageModule } = require('../examples/stage/module');
const { copyRuntime, runtimeFiles } = require('../packaging/app-files');
const profile = require('../packages/football-classic.json');
const premier = require('../packages/football-premier.json');
const root = path.resolve(__dirname, '..');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcast-core-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('broadcast-core-'));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
  });
  return directory;
}

function application(t, extension = createFootballModule(profile), initial = {}) {
  const file = path.join(temporary(t), 'state.json');
  fs.writeFileSync(file, JSON.stringify(initial));
  return { file, app: createApplication({ module: extension, stateFile: file, now: () => 1000 }) };
}

async function listen(t, server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return 'http://127.0.0.1:' + server.address().port;
}

test('migration and polling do not persist state or replay saved events', (t) => {
  const { file, app } = application(t, createFootballModule(profile), {
    goal_tick: 7,
    goal_trigger: 'goal',
  });
  const original = fs.readFileSync(file);
  app.status();
  app.read();
  app.advance();
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(app.read().goal_tick, 7);
});

test('module mutations and validation failures cannot alter committed nested state', (t) => {
  const extension = {
    id: 'fixture',
    name: 'Fixture',
    migrate: (saved) => saved,
    reduce: (state) => {
      state.nested.value = 99;
      throw Error('invalid fixture');
    },
    status: (state) => state,
  };
  const { app, file } = application(t, extension, { nested: { value: 1 } });
  const etag = app.snapshot().etag;
  assert.throws(() => app.update({}), /read only|invalid fixture/);
  const copy = app.read();
  copy.nested.value = 5;
  assert.equal(app.read().nested.value, 1);
  assert.equal(JSON.parse(fs.readFileSync(file)).nested.value, 1);
  assert.equal(app.snapshot().etag, etag);
});

test('failed disk writes roll back state, event ticks and ETag as one transaction', (t) => {
  const { app, file } = application(t);
  const before = app.read(),
    etag = app.snapshot().etag,
    original = fs.readFileSync(file);
  fs.mkdirSync(file + '.tmp');
  assert.throws(
    () => app.execute('home_goal'),
    (error) => error.code === 'SAVE_FAILED',
  );
  assert.deepEqual(app.read(), before);
  assert.equal(app.snapshot().etag, etag);
  assert.deepEqual(fs.readFileSync(file), original);
});

test('corrupt input files and asynchronous reducers are rejected without overwriting data', (t) => {
  const file = path.join(temporary(t), 'state.json');
  fs.writeFileSync(file, 'broken JSON');
  assert.throws(() => createApplication({ module: createStageModule(), stateFile: file }));
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken JSON');
  const extension = createStageModule();
  extension.reduce = async (state) => state;
  fs.writeFileSync(file, '{}');
  const app = createApplication({ module: extension, stateFile: file });
  assert.throws(() => app.update({}), /expected object/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
});

test('football packages share rules while retaining layout and substitution policies', (t) => {
  const classic = application(t).app;
  const second = application(t, createFootballModule(premier)).app;
  for (const app of [classic, second]) {
    app.execute('home_score_plus');
    app.update({ posreset_tick: 1 });
    assert.equal(app.status().score.home, 1);
  }
  assert.deepEqual(classic.read().sb_pos, { x: 423, y: 96 });
  assert.deepEqual(second.read().sb_pos, { x: 430, y: 120 });
  assert(!classic.describe().capabilities.includes('batch-substitutions'));
  assert(second.describe().capabilities.includes('batch-substitutions'));
});

test('a stage module reuses the same core and clock with no football fields', (t) => {
  const { app } = application(t, createStageModule());
  app.execute('title.show', { title: '颁奖典礼', subtitle: '最佳球员' });
  assert.equal(app.status().title, '颁奖典礼');
  assert.equal(app.status().cue, 1000);
  app.execute('title.show');
  assert.equal(app.status().cue, 1001);
  app.execute('timer.set', { durationMs: 120000 });
  app.execute('timer.start');
  app.pause();
  assert.equal(app.status().timer.running, false);
  assert.equal(app.status().timer.milliseconds, 120000);
  assert(!Object.hasOwn(app.read(), 'scoreHome'));
  assert.throws(() => app.execute('timer.set', { durationMs: -1 }), /duration/);
  assert.throws(() => app.execute('title.show', { title: 'x', timer: {} }), /Unknown/);
  assert.throws(() => app.update({ scoreHome: 5 }), /Unknown/);
});

test('versioned API discovers modules, executes commands and serves conditional state', async (t) => {
  const file = path.join(temporary(t), 'state.json');
  const base = await listen(t, createServer({ module: createStageModule(), stateFile: file }));
  const get = async (route) => (await fetch(base + route)).json();
  assert.equal((await get('/api/v1/module')).module.id, 'stage');
  assert((await get('/api/v1/commands')).commands.some((command) => command.id === 'title.show'));
  const response = await fetch(base + '/api/v1/commands/title.show', {
    method: 'POST',
    body: JSON.stringify({ title: '开幕式' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status.title, '开幕式');
  const state = await fetch(base + '/api/v1/state');
  const etag = state.headers.get('etag');
  await state.text();
  assert.equal(
    (await fetch(base + '/api/v1/state', { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  assert.equal((await get('/api/v1/status')).status.title, '开幕式');
  assert.equal((await fetch(base + '/api/v1/commands/missing', { method: 'POST' })).status, 404);
  assert.equal((await fetch(base + '/api/v1/commands/title.show')).status, 405);
  assert.equal((await fetch(base + '/api/v1/state', { method: 'POST', body: '[]' })).status, 400);
  assert.equal((await fetch(base + '/api/v1/state', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/v1/missing')).status, 404);
  assert.equal((await fetch(base + '/api/v1/state', { method: 'OPTIONS' })).status, 204);
  assert.equal(
    (
      await fetch(base + '/api/v1/state', {
        method: 'POST',
        body: ' '.repeat(32 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
});

test('legacy and versioned clients serialize competing commands against the latest state', async (t) => {
  const server = require('../control/serve').createServer({
    stateFile: path.join(temporary(t), 'state.json'),
  });
  const base = await listen(t, server);
  const responses = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      fetch(
        base + (i % 2 ? '/api/v1/commands/home_score_plus' : '/api/d200/action/home_score_plus'),
        { method: 'POST' },
      ),
    ),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    await response.text();
  }
  const state = await (await fetch(base + '/state.json')).json();
  assert.equal(state.scoreHome, 30);
  assert.equal(state.goal_scoreHome, 30);
  assert.equal((await fetch(base + '/package.js')).status, 200);
  for (const route of [
    '/control/state.json',
    '/control/state.example.json',
    '/desktop/main.js',
    '/core/application.js',
    '/control/serve.js',
    '/.git/config',
    '/control/%2e%2e%5cstate.json',
  ]) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});

test('shared client works with any module and preserves API errors and conditional reads', async (t) => {
  const file = path.join(temporary(t), 'state.json');
  const extension = createStageModule();
  const migrate = extension.migrate;
  extension.migrate = (saved, now) => ({ ...migrate(saved, now), ok: false });
  const baseURL = await listen(t, createServer({ module: extension, stateFile: file }));
  const client = require('../ui/shared/api-client').create({ baseURL });
  assert.equal((await client.describe()).id, 'stage');
  assert((await client.commands()).some((command) => command.id === 'title.show'));
  await client.execute('title.show', { title: '节目一' });
  assert.equal((await client.status()).title, '节目一');
  const first = await client.readState();
  assert.equal(first.state.title, '节目一');
  assert.equal(first.state.ok, false, 'Raw state fields are not response envelope errors');
  assert.equal((await client.readState(first.etag)).notModified, true);
  await assert.rejects(
    client.execute('missing'),
    (error) => error.status === 404 && error.code === 'UNKNOWN_COMMAND',
  );
});

test('two different modules on the same core keep independent state', async (t) => {
  const directory = temporary(t);
  const football = await listen(
    t,
    createServer({
      module: createFootballModule(profile),
      stateFile: path.join(directory, 'football.json'),
    }),
  );
  const stage = await listen(
    t,
    createServer({ module: createStageModule(), stateFile: path.join(directory, 'stage.json') }),
  );
  await (await fetch(football + '/api/v1/commands/home_score_plus', { method: 'POST' })).text();
  await (
    await fetch(stage + '/api/v1/commands/title.show', {
      method: 'POST',
      body: '{"title":"节目一"}',
    })
  ).text();
  assert.equal((await (await fetch(football + '/api/v1/state')).json()).scoreHome, 1);
  const state = await (await fetch(stage + '/api/v1/state')).json();
  assert.equal(state.title, '节目一');
  assert.equal(state.scoreHome, undefined);
});

test('portable runtime includes shared code and can boot without source tree or private data', async (t) => {
  const directory = temporary(t),
    production = path.join(directory, 'app');
  copyRuntime(root, production);
  const files = runtimeFiles(root);
  assert(files.includes('core/application.js'));
  assert(files.includes('modules/football/d200-actions.json'));
  assert(files.includes('ui/control/vendor/xlsx.full.min.js'));
  assert(
    !files.some((file) =>
      /state.*\.json$|node_modules|examples\/|console-background\.jpg/.test(file),
    ),
  );
  const createPackagedServer = require(path.join(production, 'control/serve.js')).createServer;
  const base = await listen(
    t,
    createPackagedServer({ stateFile: path.join(directory, 'data.json') }),
  );
  for (const route of [
    '/control/panel.html',
    '/control/panel.js',
    '/control/vendor/xlsx.full.min.js',
    '/control/roster-format.js',
    '/control/panel-layout.css',
    '/titles/graphics.html',
    '/titles/graphics.js',
    '/package.js',
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    await response.text();
  }
});
