'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createAELiveServer } = require('../server/ae-live-server');
const { listenLocal, closeLocal } = require('../server/listen-local');
const snapshot = {
  comp: {
    id: 17,
    name: '测试字幕合成',
    width: 1920,
    height: 1080,
    duration: 8,
    fps: 30,
    time: 1,
    workAreaStart: 0,
    workAreaDuration: 8,
  },
  controls: [
    {
      id: '22:text',
      kind: 'text',
      label: '标题',
      layerId: 22,
      layerIndex: 1,
      layerName: 'LIVE:标题',
      value: '初始标题',
    },
  ],
};
async function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-bridge-test-'));
  const calls = [];
  const server = createAELiveServer({
    dataDirectory: directory,
    vmixFetch: async (url) => {
      calls.push(new URL(url));
      return new Response('OK');
    },
  });
  const origin = await listenLocal(server);
  t.after(async () => {
    await closeLocal(server);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function request(route, payload, token) {
    const response = await fetch(
      origin + '/api/ae/' + route,
      payload === undefined
        ? {}
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: 'Bearer ' + token } : {}),
            },
            body: JSON.stringify(payload),
          },
    );
    return { status: response.status, data: await response.json() };
  }
  const token = (await request('pairing')).data.token;
  const session = (await request('agent/hello', { version: 'test' }, token)).data.session;
  await request('agent/poll', { session, snapshot }, token);
  return { request, token, session, origin, calls, directory };
}
test('AE bridge authenticates agents and queues control changes against the inspected composition', async (t) => {
  const { request, token, session, origin } = await setup(t);
  assert.equal((await request('agent/poll', { session }, 'wrong')).status, 401);
  assert.equal(
    (
      await request('command', {
        type: 'setControl',
        args: { compId: 999, id: '22:text', value: '错误合成' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('command', {
        type: 'setControl',
        args: { compId: 17, id: 'not-exposed', value: '错误控件' },
      })
    ).status,
    400,
  );
  let first = (
    await request('command', {
      type: 'setControl',
      args: { compId: 17, id: '22:text', value: '旧修改' },
    })
  ).data.command;
  const latest = (
    await request('command', {
      type: 'setControl',
      args: { compId: 17, id: '22:text', value: '新修改' },
    })
  ).data.command;
  assert.notEqual(first.id, latest.id);
  let state = (await request('state')).data;
  assert.equal(state.queue.length, 1);
  assert.equal(state.history[0].status, 'superseded');
  let polled = (await request('agent/poll', { session }, token)).data.command;
  assert.equal(polled.id, latest.id);
  assert.equal(polled.args.value, '新修改');
  assert.equal(polled.args.control.layerId, 22);
  assert.equal((await request('agent/poll', { session }, token)).data.command.id, latest.id);
  await request('agent/result', { session, id: latest.id, ok: true, snapshot }, token);
  assert.equal(
    (await request('agent/result', { session, id: latest.id, ok: true, snapshot }, token)).data
      .duplicate,
    true,
  );
  assert.equal((await request('agent/poll', { session }, token)).data.command, null);
  const remote = await fetch(origin + '/api/ae/pairing', {
    headers: { Origin: 'https://external.test' },
  });
  assert.equal(remote.status, 403);
  await request('command', { type: 'inspect' });
  const renewed = (await request('agent/hello', {}, token)).data.session;
  assert.notEqual(session, renewed);
  assert.equal((await request('agent/poll', { session }, token)).status, 409);
  state = (await request('state')).data;
  assert.equal(state.queue.length, 0);
  assert.equal(state.snapshot, null);
});
test('PNG frames publish explicitly; completed cache clips use native vMix playback and uncertain jobs never replay', async (t) => {
  const { request, token, session, origin, calls } = await setup(t);
  assert.equal((await request('output', { visible: true })).status, 400);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==',
    'base64',
  );
  const response = await fetch(origin + '/api/ae/agent/frame?session=' + session, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: png,
  });
  assert.equal(response.status, 200);
  await request('output', { visible: true });
  assert.equal((await request('output')).data.visible, true);
  assert.deepEqual(
    Buffer.from(await fetch(origin + '/frame.png').then((res) => res.arrayBuffer())),
    png,
  );
  await request('command', {
    type: 'renderClip',
    args: { compId: 17, outputModule: 'Lossless with Alpha' },
  });
  const item = (await request('agent/poll', { session }, token)).data.command;
  fs.writeFileSync(item.args.output, 'mock-rendered-mov');
  assert.equal(
    (await request('agent/result', { session, id: item.id, ok: true, snapshot }, token)).status,
    200,
  );
  const state = (await request('state')).data;
  assert.equal(state.clips.length, 1);
  await request('vmix', { action: 'add', id: state.clips[0].id });
  assert(calls.at(-1).searchParams.get('Value').startsWith('Video|'));
  await request('settings', { port: 8088, input: 'cache.mov', overlay: 2 });
  await request('vmix', { action: 'show' });
  assert.equal(calls.at(-1).searchParams.get('Function'), 'OverlayInput2In');
  await request('command', { type: 'frame', args: { compId: 17, resolution: 1 } });
  await request('agent/poll', { session }, token);
  await request('agent/hello', {}, token);
  assert.equal((await request('state')).data.history.at(-1).status, 'uncertain');
  for (const file of ['control.html', 'control.js', 'control.css', 'graphics.html', 'graphics.js'])
    assert.equal((await fetch(origin + '/ae/' + file)).status, 200);
});
test('AE ExtendScript whitelist edits only exposed controls and restores quality and render queue on failure', () => {
  let undo = 0;
  const textProperty = {
    value: { text: '原文字' },
    numKeys: 0,
    setValue(value) {
      this.value = { ...value };
    },
  };
  const textLayer = {
    id: 22,
    index: 1,
    name: 'LIVE:标题',
    locked: false,
    property(name) {
      if (name === 'ADBE Text Properties') return { property: () => textProperty };
      if (name === 'ADBE Effect Parade') return { numProperties: 0 };
    },
  };
  class CompItem {
    constructor() {
      this.id = 17;
      this.name = '测试合成';
      this.width = 1920;
      this.height = 1080;
      this.frameRate = 30;
      this.duration = 8;
      this.time = 1;
      this.workAreaStart = 0;
      this.workAreaDuration = 8;
      this.numLayers = 1;
      this.resolutionFactor = [1, 1];
      this.markerProperty = { numKeys: 0 };
    }
    layer() {
      return textLayer;
    }
    saveFrameToPng() {
      throw Error('mock render failure');
    }
  }
  const comp = new CompItem(),
    oldQueue = { render: true },
    pendingQueue = { render: false };
  let removed = false;
  const queue = {
    numItems: 2,
    rendering: false,
    item: (index) => (index === 1 ? oldQueue : pendingQueue),
    items: {
      add: () => ({
        render: false,
        outputModule: () => ({
          applyTemplate() {
            throw Error('missing template');
          },
        }),
        remove() {
          removed = true;
        },
      }),
    },
  };
  const context = vm.createContext({
    app: {
      project: { activeItem: comp, renderQueue: queue },
      beginUndoGroup() {
        undo++;
      },
      endUndoGroup() {
        undo--;
      },
    },
    CompItem,
    File: function (file) {
      this.name = file;
    },
    RQItemStatus: { DONE: 3019 },
  });
  const source = fs
    .readFileSync(path.resolve(__dirname, '../ae-plugin/jsx/host.jsx'), 'utf8')
    .replace(/^#include.*$/m, '');
  vm.runInContext(source, context);
  function dispatch(type, args) {
    context.encoded = encodeURIComponent(JSON.stringify({ type, args }));
    return JSON.parse(vm.runInContext('BroadcastLive.dispatch(encoded)', context));
  }
  const inspected = dispatch('inspect');
  assert.equal(inspected.snapshot.controls.length, 1);
  assert.equal(
    dispatch('setControl', { compId: 17, control: inspected.snapshot.controls[0], value: '新文字' })
      .ok,
    true,
  );
  assert.equal(textProperty.value.text, '新文字');
  assert.equal(undo, 0);
  textLayer.name = '其他图层';
  assert.equal(
    dispatch('setControl', {
      compId: 17,
      control: inspected.snapshot.controls[0],
      value: '不该修改',
    }).ok,
    false,
  );
  assert.equal(textProperty.value.text, '新文字');
  assert.equal(dispatch('frame', { compId: 17, output: 'test.png', resolution: 2 }).ok, false);
  assert.deepEqual([...comp.resolutionFactor], [1, 1]);
  assert.equal(
    dispatch('renderClip', { compId: 17, output: 'test.mov', outputModule: 'Missing' }).ok,
    false,
  );
  assert.equal(oldQueue.render, true);
  assert.equal(pendingQueue.render, false);
  assert.equal(removed, true);
  assert.equal(dispatch('arbitrary-js', { code: 'unsafe' }).ok, false);
});
test('CEP panel code connects, applies a remote control and publishes a live frame through a mocked AE host', async (t) => {
  const { request, origin, token } = await setup(t);
  // The actual panel runs here; only the unavailable Adobe host and visual DOM are mocked.
  class Element {
    constructor() {
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.textContent = '';
      this.children = [];
    }
    appendChild(child) {
      this.children.push(child);
    }
  }
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() {
      return new Element();
    },
  };
  const model = structuredClone(snapshot),
    calls = [];
  const window = {
    cep_node: { require },
    addEventListener() {},
    __adobe_cep__: {
      evalScript(source, callback) {
        const encoded = JSON.parse(source.slice('BroadcastLive.dispatch('.length, -1));
        const input = JSON.parse(decodeURIComponent(encoded));
        calls.push(input.type);
        let result = { ok: true };
        if (input.type === 'inspect') result.snapshot = structuredClone(model);
        else if (input.type === 'setControl') {
          model.controls[0].value = input.args.value;
          result.snapshot = structuredClone(model);
        } else if (input.type === 'frame') {
          fs.writeFileSync(
            input.args.output,
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==',
              'base64',
            ),
          );
          result = { ok: true, file: input.args.output, milliseconds: 20 };
        }
        setImmediate(() => callback(JSON.stringify(result)));
      },
    },
  };
  const context = vm.createContext({
    window,
    document,
    Buffer,
    URL,
    setTimeout,
    clearTimeout,
    require,
  });
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '../ae-plugin/panel.js'), 'utf8'),
    context,
  );
  document.getElementById('endpoint').value = origin;
  document.getElementById('token').value = token;
  document.getElementById('resolution').value = '2';
  document.getElementById('fps').value = '2';
  t.after(() => document.getElementById('disconnect').onclick());
  await document.getElementById('connect').onclick();
  async function until(check) {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error('CEP bridge timeout');
  }
  await until(async () => (await request('state')).data.snapshot?.comp?.id === 17);
  await request('command', {
    type: 'setControl',
    args: { compId: 17, id: '22:text', value: '来自工作台的修改' },
  });
  await until(async () =>
    (await request('state')).data.history.some(
      (item) => item.type === 'setControl' && item.status === 'done',
    ),
  );
  assert.equal(model.controls[0].value, '来自工作台的修改');
  assert.equal(calls.filter((type) => type === 'setControl').length, 1);
  document.getElementById('live').checked = true;
  await until(async () => (await request('state')).data.output.frameRevision > 0);
  assert(document.getElementById('metrics').textContent.includes('20 ms'));
  document.getElementById('live').checked = false;
  document.getElementById('disconnect').onclick();
});
