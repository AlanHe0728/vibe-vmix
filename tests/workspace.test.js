'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceServer } = require('../server/workspace-server');
const { listenLocal, closeLocal } = require('../server/listen-local');
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcast-modules-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function body(base, route, payload) {
  const response = await fetch(
    base + route,
    payload === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
  );
  return { status: response.status, data: await response.json() };
}
test('workspace loads no module until selected, unloads sockets and code, and preserves isolated state', async (t) => {
  const dataDirectory = directory(t),
    server = createWorkspaceServer({ dataDirectory });
  await server.initialize();
  const base = await listenLocal(server);
  t.after(() => server.shutdown());
  assert.deepEqual(server.describe().loaded, []);
  assert.equal(server.describe().version, require('../package.json').version);
  assert(
    !Object.keys(require.cache).some((file) => /modules[\\/](stage|football)[\\/]/.test(file)),
  );
  let result = await body(base, '/api/workspace', { enabled: ['stage'] });
  assert.equal(result.status, 200);
  const stage = result.data.modules.find((item) => item.id === 'stage').url;
  assert(Object.keys(require.cache).some((file) => /modules[\\/]stage[\\/]/.test(file)));
  assert(!Object.keys(require.cache).some((file) => /modules[\\/]football[\\/]/.test(file)));
  result = await body(stage, '/api/v1/state', { eventName: '舞台隔离测试' });
  assert.equal(result.status, 200);
  result = await body(base, '/api/workspace', { enabled: ['stage', 'football'] });
  assert.equal(result.status, 200);
  const football = result.data.modules.find((item) => item.id === 'football').url;
  assert.equal((await fetch(football + '/control/panel.html')).status, 200);
  assert.equal((await body(football, '/api/v1/module')).data.module.id, 'football');
  assert.equal((await body(stage, '/api/v1/state')).data.eventName, '舞台隔离测试');
  assert(!Object.hasOwn((await body(football, '/api/v1/state')).data, 'eventName'));
  result = await body(base, '/api/workspace', { enabled: ['unknown'] });
  assert.equal(result.status, 400);
  assert.equal(server.describe().loaded.length, 2);
  result = await body(base, '/api/workspace', { enabled: [] });
  assert.equal(result.status, 200);
  assert.deepEqual(server.describe().loaded, []);
  await assert.rejects(fetch(stage + '/api/v1/state'));
  await assert.rejects(fetch(football + '/api/v1/state'));
  assert(
    !Object.keys(require.cache).some((file) => /modules[\\/](stage|football)[\\/]/.test(file)),
  );
  await body(base, '/api/workspace', { enabled: ['stage'] });
  const restored = server.describe().modules.find((item) => item.id === 'stage').url;
  assert.equal((await body(restored, '/api/v1/state')).data.eventName, '舞台隔离测试');
  await server.shutdown();
  const restart = createWorkspaceServer({ dataDirectory });
  await restart.initialize();
  t.after(() => restart.shutdown());
  assert.deepEqual(restart.describe().loaded, ['stage']);
});
test('stage takes an immutable live snapshot and rejects invalid patches atomically', async (t) => {
  const { createStageServer } = require('../server/stage-server');
  const server = createStageServer({ dataDirectory: directory(t) });
  const base = await listenLocal(server);
  t.after(() => closeLocal(server));
  const program = {
    id: 'sing',
    title: '长歌',
    type: '歌唱',
    performer: '合唱团',
    subtitle: '',
    caption: '第一行\n第二行',
  };
  assert.equal((await body(base, '/api/v1/state', { programs: [program] })).status, 200);
  assert.equal((await body(base, '/api/v1/commands/program.take', { id: 'sing' })).status, 200);
  await body(base, '/api/v1/state', { programs: [{ ...program, title: '未播出的编辑' }] });
  assert.equal((await body(base, '/api/v1/state')).data.live.title, '长歌');
  await body(base, '/api/v1/commands/transition.play', {});
  let state = (await body(base, '/api/v1/state')).data;
  assert.equal(state.transition.cue, 1);
  for (const patch of [
    { programs: [program, program] },
    { style: { lowerWidth: 1728, lowerX: 800 } },
    { style: { accent: 'url(evil)' } },
    { channelAsset: '../state.json' },
    { layers: { unknown: true } },
    { vmix: { port: 0 } },
    { programs: [{ ...program, type: 'invalid' }] },
  ]) {
    assert.equal((await body(base, '/api/v1/state', patch)).status, 400);
    assert.deepEqual((await body(base, '/api/v1/state')).data, state);
  }
  await body(base, '/api/v1/commands/all.hide', {});
  state = (await body(base, '/api/v1/state')).data;
  assert(Object.values(state.layers).every((value) => !value));
  const response = await fetch(base + '/api/v1/state');
  const etag = response.headers.get('ETag');
  await response.text();
  assert.equal(
    (await fetch(base + '/api/v1/state', { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  const { templates } = (await body(base, '/api/stage/templates')).data;
  for (const id of ['lyrics', 'announcement', 'ranking'])
    assert(templates.some((item) => item.id === id));
  for (const file of ['control.html', 'control.js', 'graphics.html', 'graphics.css', 'graphics.js'])
    assert.equal((await fetch(base + '/stage/' + file)).status, 200);
});
test('stage lyrics play one saved line at a time and preserve the on-air snapshot', async (t) => {
  const { createStageServer } = require('../server/stage-server');
  const dataDirectory = directory(t);
  const server = createStageServer({ dataDirectory });
  const base = await listenLocal(server);
  t.after(() => closeLocal(server));
  const program = {
    id: 'song',
    title: '歌曲',
    type: '歌唱',
    performer: '',
    subtitle: '',
    caption: '第一句\n\n 第二句 \r\n第一句',
  };
  await body(base, '/api/v1/state', { programs: [program] });
  assert.equal(
    (await body(base, '/api/v1/commands/caption.take', { programId: 'song', index: 0 })).status,
    200,
  );
  let state = (await body(base, '/api/v1/state')).data;
  assert.equal(state.live, null);
  assert.equal(state.captionLive.index, 0);
  assert.equal(state.layers.caption, true);
  await body(base, '/api/v1/commands/caption.next', { programId: 'song' });
  assert.equal((await body(base, '/api/v1/state')).data.captionLive.index, 1);
  await body(base, '/api/v1/commands/caption.take', { programId: 'song', index: 2 });
  assert.equal(
    (await body(base, '/api/v1/commands/caption.next', { programId: 'song' })).status,
    400,
  );
  await body(base, '/api/v1/commands/caption.previous', { programId: 'song' });
  assert.equal((await body(base, '/api/v1/state')).data.captionLive.index, 1);
  await body(base, '/api/v1/state', { programs: [{ ...program, caption: '新第一句\n新第二句' }] });
  assert.equal(
    (await body(base, '/api/v1/commands/caption.next', { programId: 'song' })).status,
    400,
  );
  state = (await body(base, '/api/v1/state')).data;
  assert.equal(state.captionLive.caption, program.caption);
  await body(base, '/api/v1/commands/caption.take', { programId: 'song', index: 1 });
  await body(base, '/api/v1/commands/caption.hide', {});
  state = (await body(base, '/api/v1/state')).data;
  assert.equal(state.layers.caption, false);
  assert.equal(state.captionLive.caption, '新第一句\n新第二句');
  assert.equal(
    (
      await body(base, '/api/v1/state', {
        programs: [{ ...program, caption: Array(501).fill('句').join('\n') }],
      })
    ).status,
    400,
  );
  await closeLocal(server);
  const restart = createStageServer({ dataDirectory });
  const restored = await listenLocal(restart);
  t.after(() => closeLocal(restart));
  assert.equal((await body(restored, '/api/v1/state')).data.captionLive.index, 1);
});
test('preview layout changes apply only explicitly and reject conflicting edits', async (t) => {
  const server = createWorkspaceServer({ dataDirectory: directory(t) });
  await server.initialize();
  const base = await listenLocal(server);
  t.after(() => server.shutdown());
  const workspace = (
    await body(base, '/api/workspace', { enabled: ['football', 'stage', 'ae-live'] })
  ).data;
  const stage = workspace.modules.find((item) => item.id === 'stage').url;
  const football = workspace.modules.find((item) => item.id === 'football').url;
  const ae = workspace.modules.find((item) => item.id === 'ae-live').url;
  let before = (await body(base, '/api/workspace/layout/stage')).data.layout;
  assert.equal((await body(stage, '/api/v1/state')).data.style.captionX, before.captionX);
  assert.equal(
    (
      await body(base, '/api/workspace/layout/stage', {
        base: { captionX: before.captionX },
        draft: { captionX: 350 },
      })
    ).status,
    200,
  );
  assert.equal((await body(stage, '/api/v1/state')).data.style.captionX, 350);
  assert.equal(
    (
      await body(base, '/api/workspace/layout/stage', {
        base: { captionX: before.captionX },
        draft: { captionX: 400 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await body(base, '/api/workspace/layout/stage', {
        base: { captionX: 350 },
        draft: { captionX: 9000 },
      })
    ).status,
    400,
  );
  before = (await body(base, '/api/workspace/layout/football')).data.layout;
  assert.equal(
    (
      await body(base, '/api/workspace/layout/football', {
        base: { sb_pos: before.sb_pos },
        draft: { sb_pos: { x: 700, y: 200 } },
      })
    ).status,
    200,
  );
  assert.deepEqual((await body(football, '/api/v1/state')).data.sb_pos, { x: 700, y: 200 });
  assert.equal(
    (
      await body(base, '/api/workspace/layout/football', {
        base: { sb_pos: before.sb_pos },
        draft: { sb_pos: { x: 800, y: 200 } },
      })
    ).status,
    409,
  );
  before = (await body(base, '/api/workspace/layout/ae-live')).data.layout;
  assert.equal(
    (
      await body(base, '/api/workspace/layout/ae-live', {
        base: { x: before.x, scale: before.scale },
        draft: { x: 100, scale: 0.5 },
      })
    ).status,
    200,
  );
  assert.deepEqual((await body(ae, '/api/ae/output')).data.layout, { x: 100, y: 0, scale: 0.5 });
  await body(ae, '/api/ae/settings', { port: 8088, input: 'test', overlay: 1 });
  assert.equal((await body(ae, '/api/ae/output')).data.layout.x, 100);
  assert.equal(
    (await body(base, '/api/workspace/layout/ae-live', { base: { x: 100 }, draft: { x: 9000 } }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(base + '/api/workspace/layout/stage', {
        headers: { Origin: 'https://external.test' },
      })
    ).status,
    403,
  );
});
test('native assets stream from disk, media supports ranges, GT uses the vMix engine, AE/NewBlue never pretend to render internally', async (t) => {
  const { createStageServer } = require('../server/stage-server');
  const calls = [];
  const server = createStageServer({
    dataDirectory: directory(t),
    vmixFetch: async (url) => {
      calls.push(new URL(url));
      return new Response('OK');
    },
  });
  const base = await listenLocal(server);
  t.after(() => closeLocal(server));
  async function upload(name, content) {
    const response = await fetch(base + '/api/stage/upload?name=' + encodeURIComponent(name), {
      method: 'POST',
      body: content,
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await upload('bad.exe', '123')).status, 400);
  const media = (await upload('透明动画.webm', '0123456789')).data.asset;
  const range = await fetch(base + '/assets/' + media.file, { headers: { Range: 'bytes=2-5' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), '2345');
  assert.equal(
    (await fetch(base + '/assets/' + media.file, { headers: { Range: 'bytes=200-500' } })).status,
    416,
  );
  const gt = (await upload('title.gtzip', 'registered-file')).data.asset;
  assert.equal((await body(base, '/api/stage/vmix', { action: 'add', id: gt.id })).status, 200);
  assert.equal(calls.at(-1).searchParams.get('Function'), 'AddInput');
  assert(calls.at(-1).searchParams.get('Value').startsWith('Title|'));
  const ae = (await upload('project.aep', 'registered-source')).data.asset;
  assert.equal((await body(base, '/api/stage/vmix', { action: 'add', id: ae.id })).status, 400);
  const nb = (await upload('title.nbtitle', 'registered-source')).data.asset;
  assert.equal((await body(base, '/api/stage/vmix', { action: 'add', id: nb.id })).status, 400);
  assert.equal((await fetch(base + '/assets/' + ae.file)).status, 404);
  const response = await fetch(base + '/api/v1/state', {
    method: 'POST',
    headers: { Origin: 'https://external.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName: 'rejected' }),
  });
  assert.equal(response.status, 403);
  assert.equal((await body(base, '/api/stage/library')).data.assets.length, 4);
});

test('LAN operators prepare and hand off GT captions without sharing the host API or writing live cues', async (t) => {
  const { createStageServer } = require('../server/stage-server');
  const { importLyrics } = require('../modules/stage/captions');
  const dataDirectory = directory(t);
  const calls = [];
  let rejectOverlay = true;
  let finishOverlay;
  const server = createStageServer({
    dataDirectory,
    vmixFetch: async (url) => {
      const query = url.searchParams;
      const command = query.get('Function');
      calls.push([command, query.get('Value')]);
      if (command === 'OverlayInput2In' && rejectOverlay)
        return new Response('Error', { status: 500 });
      if (command === 'OverlayInput2In')
        await new Promise((resolve) => {
          finishOverlay = resolve;
        });
      return new Response('OK');
    },
  });
  const host = await listenLocal(server);
  t.after(() => closeLocal(server));
  const endpoint = '/api/stage/collaboration';
  const post = (payload) => body(host, endpoint, payload);
  const { session } = (await body(host, endpoint)).data;
  const address = session.addresses[0];
  if (!address) return t.skip('requires a local IPv4 interface');
  const { session: invitation } = (await post({ action: 'open', address })).data;
  const lan = new URL(invitation.url).origin;
  assert.equal((await fetch(invitation.url)).status, 200);
  assert.equal((await fetch(lan + '/stage-module/captions.js')).status, 200);
  assert.equal((await fetch(lan + '/api/v1/state')).status, 404);
  assert.equal((await fetch(lan + '/api/stage/register')).status, 404);
  const remote = async (action, data, token) => {
    const response = await fetch(lan + '/api/collaboration/' + action, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: 'Bearer ' + token }),
      },
      ...(data !== undefined && { method: 'POST', body: JSON.stringify(data) }),
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await remote('state')).status, 401);
  assert.equal((await remote('join', { name: 'A', code: 'bad' })).status, 403);
  const { token: a } = (await remote('join', { name: 'A', code: invitation.code })).data;
  const { token: b } = (await remote('join', { name: 'B', code: invitation.code })).data;
  const saved = await body(host, '/api/v1/state', {
    programs: [{ id: 'song', type: '歌唱', title: '试唱', caption: '' }],
    vmix: { input: 'Lyrics', captionMode: true, overlay: 2 },
  });
  assert.equal(saved.status, 200);
  const caption = importLyrics(
    '[ti:试唱]\r\n[00:11.2]第二句\r\n[00:05.05][00:19]第一句',
    true,
  ).join('\n');
  assert.equal(caption, '第一句\n第二句\n第一句');
  assert.equal(
    (await remote('save', { programId: 'song', caption: '', value: caption }, a)).status,
    200,
  );
  assert.equal(
    (await remote('save', { programId: 'song', caption: '', value: '过时的草稿' }, b)).status,
    409,
  );
  const ready = await remote('prepare', { programId: 'song', caption, index: 0 }, a);
  assert.equal(ready.data.prepared.text, '第一句');
  assert.deepEqual(calls, []);
  assert.equal((await remote('take', ready.data.prepared, a)).status, 409);
  const bId = ready.data.session.clients.find((client) => client.name === 'B').id;
  assert.equal((await post({ action: 'control', target: bId })).status, 200);
  assert.equal((await remote('take', ready.data.prepared, b)).status, 502);
  assert.equal((await remote('state', undefined, a)).data.live.uncertain, true);
  rejectOverlay = false;
  const taking = remote('take', ready.data.prepared, b);
  t.after(() => finishOverlay?.());
  while (!finishOverlay) await new Promise((resolve) => setTimeout(resolve, 10));
  const inFlight = (await remote('state', undefined, a)).data;
  assert.equal(inFlight.busy, true);
  assert.equal((await post({ action: 'control', target: 'claim' })).status, 409);
  finishOverlay();
  assert.equal((await taking).data.live.text, '第一句');
  const received = (await remote('state', undefined, a)).data;
  assert.equal(received.live.visible, true);
  assert.equal(received.live.operator, 'B');
  assert.equal(received.prepared, null);
  const aId = received.session.clients.find((client) => client.name === 'A').id;
  assert.equal((await remote('control', { target: aId }, b)).status, 200);
  assert.equal(
    (await remote('caption.next', { programId: 'song', caption }, a)).data.live.text,
    '第二句',
  );
  assert.equal((await remote('caption.hide', {}, a)).data.live.visible, false);
  assert.deepEqual(calls, [
    ['SetText', '第一句'],
    ['OverlayInput2In', null],
    ['SetText', '第一句'],
    ['OverlayInput2In', null],
    ['SetText', '第二句'],
    ['OverlayInput2Out', null],
  ]);
  const disk = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'state.json'), 'utf8'));
  assert.equal(disk.programs[0].caption, caption);
  assert.equal(disk.captionLive, null);
  await post({ action: 'stop' });
  await assert.rejects(fetch(invitation.url));
});
