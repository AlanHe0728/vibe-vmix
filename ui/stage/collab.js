'use strict';
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('stage-session') || '';
let state,
  etag = '',
  signature = '',
  base = '',
  dirty = false,
  pending = false,
  timer;

async function request(action, data) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (action === 'state' && etag) headers['If-None-Match'] = etag;
  const response = await fetch('/api/collaboration/' + action, {
    headers,
    ...(data !== undefined && { method: 'POST', body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 304) return null;
  const result = await response.json();
  if (response.status === 401) disconnect();
  if (!response.ok) throw Error(result.error || '协作请求失败');
  etag = response.headers.get('ETag') || '';
  return result;
}

function disconnect() {
  clearTimeout(timer);
  token = '';
  etag = '';
  signature = '';
  sessionStorage.removeItem('stage-session');
  $('join').hidden = false;
  $('desk').hidden = true;
  $('connection').textContent = '尚未加入';
}

function program() {
  return state.programs.find((item) => item.id === $('program').value);
}

function setDraft() {
  dirty = false;
  base = $('lyrics').value = program()?.caption || '';
}

function options(id, entries) {
  const select = $(id);
  const prior = select.value;
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  if (entries.some(([value]) => value === prior)) select.value = prior;
}

function render() {
  const { live, prepared, session, native, busy } = state;
  const current = program();
  const authorized = session.owns && !busy;
  const same = live.programId === current?.id;
  const cues = StageCaptions.lines(current?.caption);
  $('connection').textContent = '已加入';
  $('join').hidden = true;
  $('desk').hidden = false;
  $('output').textContent = native ? 'vMix GT Title' : '内置舞台包装';
  $('current').textContent = live.uncertain
    ? '请导播在 vMix 中确认播出状态'
    : live.visible
      ? live.text + (live.operator ? ' · ' + live.operator : '')
      : '已下屏';
  $('prepared').textContent = prepared ? prepared.text + ' · ' + prepared.operator : '尚未选句';
  $('owner').textContent = session.owner || '等待接手';
  $('claim').disabled = Boolean(session.owner) || busy;
  $('release').disabled = !authorized;
  $('handoff').hidden = !authorized;
  options('target', [
    ['host', '导播主机'],
    ...session.clients.filter((client) => !client.owns).map((client) => [client.id, client.name]),
  ]);
  $('program').disabled = dirty;
  $('lyrics').disabled = $('file').disabled = !current;
  $('save').disabled = !current || !dirty;
  $('discard').disabled = !dirty;
  $('take').disabled = !authorized || !prepared;
  $('previous').disabled = !authorized || !same || live.index <= 0;
  $('next').disabled = !authorized || !cues.length || (same && live.index >= cues.length - 1);
  $('next').textContent = same ? '下一句' : '播出第一句';
  $('hide').disabled = !authorized || !(live.visible || live.uncertain);
  const list = $('captionList');
  const offset = list.scrollTop;
  const focus = document.activeElement?.dataset?.index;
  list.replaceChildren();
  cues.forEach((line, index) => {
    const entry = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'caption-row';
    button.dataset.index = index;
    const playing = same && live.visible && live.index === index && live.text === line;
    const waiting = prepared?.programId === current.id && prepared.index === index;
    button.setAttribute('aria-current', String(playing));
    button.textContent = index + 1 + '　' + line + (playing ? ' · 上屏' : waiting ? ' · 待播' : '');
    button.onclick = run(() => update('prepare', cue(index)));
    entry.append(button);
    list.append(entry);
  });
  list.scrollTop = offset;
  if (focus !== undefined)
    list.querySelector('[data-index="' + focus + '"]')?.focus({ preventScroll: true });
}

function accept(next) {
  if (!next) return;
  const nextSignature = JSON.stringify(next);
  if (signature === nextSignature) return;
  signature = nextSignature;
  state = next;
  options(
    'program',
    state.programs.map((item) => [item.id, item.title || '未命名节目']),
  );
  if (!dirty) setDraft();
  render();
}

async function update(action, data) {
  const result = await request(action, data);
  if (result?.programs) accept(result);
  else accept(await request('state'));
}

async function poll() {
  clearTimeout(timer);
  if (!token) return;
  try {
    if (!pending) accept(await request('state'));
    if (token) $('connection').textContent = '已加入';
  } catch (error) {
    if (token) $('connection').textContent = '正在重新连接';
    else $('notice').textContent = error.message;
  }
  if (token) timer = setTimeout(poll, document.hidden ? 4000 : 1000);
}

function run(action) {
  return async (event) => {
    event?.preventDefault();
    if (pending) return;
    pending = true;
    clearTimeout(timer);
    $('notice').textContent = '';
    try {
      await action();
    } catch (error) {
      $('notice').textContent = error.message;
    } finally {
      pending = false;
      if (token) timer = setTimeout(poll, 500);
    }
  };
}

function cue(index) {
  const item = program();
  if (!item) throw Error('请选择节目');
  return { programId: item.id, caption: item.caption, index };
}

$('join').onsubmit = run(async () => {
  const result = await request('join', { name: $('name').value, code: $('code').value });
  token = result.token;
  sessionStorage.setItem('stage-session', token);
  await update('state');
});
$('program').onchange = () => {
  setDraft();
  render();
};
$('claim').onclick = run(() => update('control', { target: 'claim' }));
$('release').onclick = run(() => update('control', { target: 'release' }));
$('leave').onclick = run(async () => {
  await request('leave', {});
  disconnect();
});
$('handoff').onsubmit = run(() => update('control', { target: $('target').value }));
$('take').onclick = run(() => update('take', state.prepared));
$('previous').onclick = run(() => update('caption.previous', cue()));
$('next').onclick = run(() => update('caption.next', cue()));
$('hide').onclick = run(() => update('caption.hide', {}));
$('lyrics').oninput = () => {
  dirty = $('lyrics').value !== base;
  render();
};
$('file').onchange = run(async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file) return;
  $('lyrics').value = await StageCaptions.readLyrics(file);
  $('lyrics').oninput();
});
$('save').onclick = run(async () => {
  const next = await request('save', { ...cue(), caption: base, value: $('lyrics').value });
  dirty = false;
  accept(next);
  setDraft();
  render();
  $('notice').textContent = '歌词已保存';
});
$('discard').onclick = () => {
  setDraft();
  render();
};
poll();
