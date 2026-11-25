'use strict';
const $ = (id) => document.getElementById(id);
let nodeRequire, http, fs, os, path;
try {
  nodeRequire = window.cep_node ? window.cep_node.require : require;
  http = nodeRequire('http');
  fs = nodeRequire('fs');
  os = nodeRequire('os');
  path = nodeRequire('path');
} catch (_) {
  $('status').textContent = '请从 After Effects 的扩展菜单打开此插件';
}
let endpoint,
  token,
  session = '',
  snapshot,
  timer,
  busy = false,
  pendingResult = null,
  signature = '',
  lastInspect = 0,
  nextFrame = 0,
  playbackStart = 0,
  frameNumber = 0,
  consecutiveFailures = 0;
function log(message) {
  $('log').textContent = (
    new Date().toLocaleTimeString() +
    ' ' +
    message +
    '\n' +
    $('log').textContent
  ).slice(0, 8000);
}
function network(route, data, binary) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint + '/api/ae/' + route);
    const body = binary || Buffer.from(JSON.stringify(data || {}), 'utf8');
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': binary ? 'image/png' : 'application/json',
          'Content-Length': body.length,
        },
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) response.destroy(Error('工作台响应过大'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (response.statusCode !== 200) {
              const error = Error(result.error);
              error.status = response.statusCode;
              reject(error);
            } else resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(7000, () => request.destroy(Error('工作台连接超时')));
    request.on('error', reject);
    request.end(body);
  });
}
function host(type, args) {
  return new Promise((resolve, reject) => {
    if (!window.__adobe_cep__) {
      reject(Error('AE 宿主接口不可用'));
      return;
    }
    const encoded = encodeURIComponent(JSON.stringify({ type, args: args || {} }));
    window.__adobe_cep__.evalScript(
      'BroadcastLive.dispatch(' + JSON.stringify(encoded) + ')',
      (result) => {
        try {
          const body = JSON.parse(result);
          if (!body.ok) throw Error(body.error);
          resolve(body);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}
function renderControls() {
  if (!snapshot) return;
  $('comp').textContent = snapshot.comp.name;
  $('info').textContent =
    snapshot.comp.width + ' × ' + snapshot.comp.height + ' · ' + snapshot.comp.fps + ' fps';
  const next = JSON.stringify([
    snapshot.comp.id,
    snapshot.controls.map((control) => [control.id, control.kind]),
  ]);
  if (next === signature) return;
  signature = next;
  $('controls').textContent = '';
  snapshot.controls.forEach((control) => {
    const row = document.createElement('div');
    row.className = 'control';
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement(control.kind === 'text' ? 'textarea' : 'input');
    if (control.kind === 'text') {
      input.rows = 2;
      input.value = control.value;
      input.maxLength = 2000;
    } else if (control.kind === 'color') {
      input.type = 'color';
      input.value =
        '#' +
        control.value
          .map((value) =>
            Math.round(value * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
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
    button.onclick = async () => {
      if (busy) {
        log('AE 正忙，请稍后操作');
        return;
      }
      busy = true;
      try {
        let value = input.value;
        if (control.kind === 'color')
          value = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
        else if (control.kind === 'checkbox') value = input.checked ? 1 : 0;
        else if (control.kind !== 'text') value = Number(value);
        const result = await host('setControl', { compId: snapshot.comp.id, control, value });
        snapshot = result.snapshot;
        renderControls();
        nextFrame = 0;
      } catch (error) {
        log(error.message);
      } finally {
        busy = false;
      }
    };
    label.appendChild(input);
    row.appendChild(label);
    row.appendChild(button);
    $('controls').appendChild(row);
  });
}
async function inspect() {
  const result = await host('inspect');
  snapshot = result.snapshot;
  lastInspect = Date.now();
  renderControls();
  return snapshot;
}
async function capture(args) {
  const file = path.join(
    os.tmpdir(),
    'broadcast-ae-' + session + '-' + (frameNumber++ % 2) + '.png',
  );
  let result;
  try {
    result = await host('frame', { ...args, output: file });
    const stat = fs.statSync(file);
    if (stat.size > 32 * 1024 * 1024) throw Error('画面超过 32 MB，请降低分辨率');
    await network(
      'agent/frame?session=' + encodeURIComponent(session),
      null,
      fs.readFileSync(file),
    );
    $('metrics').textContent =
      '最近渲染 ' +
      result.milliseconds +
      ' ms · 理论上限 ' +
      (1000 / Math.max(1, result.milliseconds)).toFixed(1) +
      ' 帧 / 秒';
  } finally {
    try {
      fs.unlinkSync(file);
    } catch (_) {}
  }
  return result;
}
async function tick() {
  clearTimeout(timer);
  if (!session) return;
  if (busy) {
    timer = setTimeout(tick, 150);
    return;
  }
  busy = true;
  try {
    if (pendingResult) {
      await network('agent/result', { session, ...pendingResult });
      pendingResult = null;
    }
    if (Date.now() - lastInspect > 1200) {
      try {
        await inspect();
      } catch (_) {
        snapshot = null;
      }
    }
    const response = await network('agent/poll', { session, snapshot });
    consecutiveFailures = 0;
    $('status').textContent = '已连接 · 本机工作台';
    if (response.command) {
      const item = response.command;
      try {
        const result =
          item.type === 'frame' ? await capture(item.args) : await host(item.type, item.args);
        if (result.snapshot) {
          snapshot = result.snapshot;
          renderControls();
        }
        pendingResult = { id: item.id, ok: true, snapshot: result.snapshot };
        if (item.type === 'setControl' || item.type === 'seek') nextFrame = 0;
      } catch (error) {
        pendingResult = { id: item.id, ok: false, error: error.message };
        log(error.message);
      }
      await network('agent/result', { session, ...pendingResult });
      pendingResult = null;
    } else if ($('live').checked && snapshot && Date.now() >= nextFrame) {
      const started = Date.now(),
        args = { compId: snapshot.comp.id, resolution: Number($('resolution').value) };
      if ($('advance').checked) {
        if (!playbackStart) playbackStart = started;
        args.seconds =
          snapshot.comp.workAreaStart +
          (((started - playbackStart) / 1000) % snapshot.comp.workAreaDuration);
      } else playbackStart = 0;
      await capture(args);
      nextFrame = Math.max(Date.now(), started + 1000 / Number($('fps').value));
    }
  } catch (error) {
    if (error.status === 400 && pendingResult)
      pendingResult = { id: pendingResult.id, ok: false, error: error.message };
    consecutiveFailures++;
    $('status').textContent = '连接异常 · 正在重试';
    if (consecutiveFailures === 1) log(error.message);
    if ([401, 409].includes(error.status)) {
      session = '';
      $('status').textContent = '连接已失效，请重新连接';
      $('connect').disabled = false;
      $('disconnect').disabled = true;
    }
  } finally {
    busy = false;
    if (session) timer = setTimeout(tick, consecutiveFailures ? 2000 : 100);
  }
}
$('connect').onclick = async () => {
  if (busy || !http) return;
  endpoint = $('endpoint').value.replace(/\/+$/, '');
  token = $('token').value.trim();
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) || !/^[a-f0-9]{48}$/.test(token)) {
    log('请填写工作台显示的本机地址与完整密钥');
    return;
  }
  busy = true;
  try {
    const result = await network('agent/hello', { version: '1.0.0' });
    session = result.session;
    pendingResult = null;
    snapshot = null;
    signature = '';
    playbackStart = 0;
    await inspect();
    $('connect').disabled = true;
    $('disconnect').disabled = false;
  } catch (error) {
    session = '';
    log(error.message);
  } finally {
    busy = false;
    if (session) tick();
  }
};
$('disconnect').onclick = () => {
  session = '';
  clearTimeout(timer);
  $('connect').disabled = false;
  $('disconnect').disabled = true;
  $('status').textContent = '已断开';
};
for (const [id, type] of [
  ['refresh', 'inspect'],
  ['expose', 'expose'],
  ['demo', 'demo'],
])
  $(id).onclick = async () => {
    if (busy) {
      log('AE 正忙，请稍后操作');
      return;
    }
    busy = true;
    try {
      const result = await host(type);
      snapshot = result.snapshot;
      signature = '';
      renderControls();
      nextFrame = 0;
    } catch (error) {
      log(error.message);
    } finally {
      busy = false;
    }
  };
$('render').onclick = () => {
  if (!session || !snapshot) {
    log('请先连接工作台并读取合成');
    return;
  }
  // Same queue as remote operations, with the local pairing credential.
  const url = new URL(endpoint + '/api/ae/command');
  const payload = Buffer.from(
    JSON.stringify({
      type: 'renderClip',
      args: { compId: snapshot.comp.id, outputModule: $('outputModule').value },
    }),
  );
  const request = http.request(
    {
      hostname: '127.0.0.1',
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Authorization: 'Bearer ' + token,
      },
    },
    (response) => {
      const parts = [];
      response.on('data', (part) => parts.push(part));
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(parts).toString());
          log(response.statusCode === 200 ? '缓存渲染已加入队列' : body.error);
        } catch (error) {
          log(error.message);
        }
      });
    },
  );
  request.on('error', (error) => log(error.message));
  request.end(payload);
};
window.addEventListener('beforeunload', () => {
  session = '';
  clearTimeout(timer);
});
