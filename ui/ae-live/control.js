'use strict';
const $ = (id) => document.getElementById(id);
$('openPreview').onclick = () => {
  if (window.parent !== window) window.parent.postMessage({ type: 'open-preview' }, '*');
  else window.open('/ae/graphics.html', '_blank');
};
let state,
  signature = '',
  revision = 0,
  pairing;
const labels = {
  inspect: '读取合成',
  setControl: '修改控件',
  frame: '生成画面',
  renderClip: '渲染动画',
  seek: '定位',
  markers: '直播标记',
};
async function api(url, data) {
  const response = await fetch(
    '/api/ae/' + url,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}
function run(action) {
  return async (event) => {
    event?.preventDefault();
    $('notice').textContent = '';
    try {
      await action(event);
    } catch (error) {
      $('notice').textContent = error.message;
    }
  };
}
async function command(type, args = {}) {
  await api('command', {
    type,
    args: { ...(type === 'inspect' ? {} : { compId: state?.snapshot?.comp?.id }), ...args },
  });
  await refresh();
}
const hex = (color) =>
  '#' +
  color
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function drawControls() {
  const snapshot = state.snapshot;
  const next = JSON.stringify([
    snapshot?.comp?.id,
    snapshot?.controls?.map((control) => [control.id, control.kind]),
  ]);
  $('compName').textContent = snapshot?.comp?.name || '当前合成';
  $('compInfo').textContent = snapshot
    ? snapshot.comp.width + ' × ' + snapshot.comp.height + ' · ' + snapshot.comp.fps + ' fps'
    : '';
  if (signature === next) {
    for (const control of snapshot?.controls || []) {
      const input = [...document.querySelectorAll('[data-id]')].find(
        (item) => item.dataset.id === control.id,
      );
      if (!input || document.activeElement === input) continue;
      if (input.dataset.pending && input.dataset.pending === JSON.stringify(control.value))
        delete input.dataset.pending;
      if (input.dataset.pending || input.dataset.dirty) continue;
      if (control.kind === 'checkbox') input.checked = Boolean(control.value);
      else input.value = control.kind === 'color' ? hex(control.value) : control.value;
    }
    return;
  }
  signature = next;
  $('controls').replaceChildren();
  if (!snapshot?.controls?.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '尚无直播控件。请在 AE 插件中将选中图层标记为 LIVE，或创建示例合成。';
    $('controls').append(p);
    return;
  }
  snapshot.controls.forEach((control) => {
    const row = document.createElement('div');
    row.className = 'live-control';
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement(control.kind === 'text' ? 'textarea' : 'input');
    input.dataset.id = control.id;
    input.oninput = () => {
      input.dataset.dirty = 'true';
    };
    if (control.kind === 'text') {
      input.rows = 2;
      input.maxLength = 2000;
      input.value = control.value;
    } else if (control.kind === 'color') {
      input.type = 'color';
      input.value = hex(control.value);
    } else if (control.kind === 'checkbox') {
      input.type = 'checkbox';
      input.checked = Boolean(control.value);
    } else {
      input.type = 'number';
      input.step = 'any';
      input.value = control.value;
    }
    const button = document.createElement('button');
    button.textContent = '应用';
    button.onclick = run(async () => {
      let value = input.value;
      if (control.kind === 'color')
        value = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
      else if (control.kind === 'checkbox') value = input.checked ? 1 : 0;
      else if (control.kind !== 'text') value = Number(value);
      input.dataset.pending = JSON.stringify(value);
      delete input.dataset.dirty;
      try {
        await command('setControl', { id: control.id, value });
      } catch (error) {
        delete input.dataset.pending;
        input.dataset.dirty = 'true';
        throw error;
      }
    });
    label.append(input);
    row.append(label, button);
    $('controls').append(row);
  });
}
async function refresh() {
  state = await api('state');
  $('status').textContent = state.connected
    ? 'AE 插件已连接'
    : state.inFlight?.type === 'renderClip'
      ? 'AE 正在渲染或暂未响应'
      : 'AE 插件未连接';
  drawControls();
  $('queue').replaceChildren();
  const rows = [
    ...(state.inFlight ? [{ ...state.inFlight, status: 'running' }] : []),
    ...state.queue.map((item) => ({ ...item, status: 'queued' })),
    ...state.history.slice(-5).reverse(),
  ];
  for (const item of rows) {
    const p = document.createElement('p');
    p.textContent =
      (labels[item.type] || item.type) +
      ' · ' +
      ({
        queued: '待执行',
        running: '执行中',
        done: '完成',
        failed: '失败',
        cancelled: '已取消',
        uncertain: '需核对结果',
        superseded: '已被新值替代',
      }[item.status] || item.status) +
      (item.message ? ' · ' + item.message : '');
    $('queue').append(p);
  }
  if (state.output.frameRevision && revision !== state.output.frameRevision) {
    revision = state.output.frameRevision;
    $('framePreview').src = '/frame.png?revision=' + revision;
    $('framePreview').hidden = false;
    $('previewEmpty').hidden = true;
  }
  $('frameInfo').textContent = state.output.frameRevision
    ? '最近画面：' +
      new Date(state.output.lastFrameAt).toLocaleTimeString() +
      (state.output.visible ? ' · 已上屏' : ' · 已下屏')
    : '';
  $('clips').replaceChildren();
  for (const clip of state.clips) {
    const row = document.createElement('div');
    row.className = 'clip';
    const title = document.createElement('strong');
    title.textContent = clip.name + ' · ' + new Date(clip.createdAt).toLocaleTimeString();
    const button = document.createElement('button');
    button.textContent = '添加到 vMix';
    button.disabled = !clip.available;
    button.onclick = run(() => api('vmix', { action: 'add', id: clip.id }));
    row.append(title, button);
    $('clips').append(row);
  }
}
$('inspect').onclick = run(() => command('inspect'));
$('clear').onclick = run(() => api('clear', {}));
$('frame').onclick = run(() => command('frame', { resolution: 1 }));
$('markers').onclick = run(() => command('markers'));
$('seek').onclick = run(() => command('seek', { seconds: Number($('seconds').value) }));
$('show').onclick = run(() => api('output', { visible: true }));
$('hide').onclick = run(() => api('output', { visible: false }));
$('renderForm').onsubmit = run(() =>
  command('renderClip', { outputModule: $('outputModule').value }),
);
$('vmixForm').onsubmit = run(() =>
  api('settings', {
    port: Number($('port').value),
    overlay: Number($('overlay').value),
    input: $('input').value,
  }),
);
document.querySelectorAll('[data-action]').forEach((button) => {
  button.onclick = run(() => api('vmix', { action: button.dataset.action }));
});
$('copyPair').onclick = run(async () => {
  await navigator.clipboard.writeText('地址：' + pairing.endpoint + '\n密钥：' + pairing.token);
  $('notice').textContent = '连接信息已复制';
});
$('output').value = location.origin + '/ae/graphics.html';
$('copyOutput').onclick = run(() => navigator.clipboard.writeText($('output').value));
async function poll() {
  try {
    await refresh();
  } catch (error) {
    $('status').textContent = '服务连接中断';
  }
  setTimeout(poll, document.hidden ? 5000 : 1000);
}
async function init() {
  pairing = await api('pairing');
  $('endpoint').value = pairing.endpoint;
  $('token').value = pairing.token;
  await refresh();
  $('port').value = state.settings.port;
  $('input').value = state.settings.input;
  $('overlay').value = state.settings.overlay;
  poll();
}
init().catch((error) => {
  $('notice').textContent = error.message;
});
