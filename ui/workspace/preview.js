'use strict';
const $ = (id) => document.getElementById(id);
const definitions = {
  football: [
    ['sb', '比分牌'],
    ['clk', '比赛计时'],
    ['rst', '比赛状态'],
    ['card', '红黄牌'],
    ['ply', '球员字幕'],
    ['goal', '进球'],
    ['sub', '换人'],
    ['logo', '赛事 Logo'],
    ['lineup', '单队名单'],
    ['lineup_all', '双方名单'],
  ],
  stage: [
    ['channel', '台标'],
    ['event', '活动 Logo'],
    ['sponsor', '赞助商'],
    ['lower', '节目字幕条'],
    ['caption', '歌词字幕'],
  ],
  'ae-live': [['frame', 'AE 画面']],
};
const names = { football: '足球赛事', stage: '舞台节目', 'ae-live': 'AE 直播连接' };
const order = ['football', 'stage', 'ae-live'];
const base = {},
  draft = {},
  boxes = {};
let modules = [],
  tab = new URLSearchParams(location.search).get('module') || 'all';
let view = 'dual',
  selected = '',
  busy = false,
  scales = { pvw: 1, pgm: 1 },
  timer;

async function api(url, data) {
  const response = await fetch(
    url,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '请求失败');
  return result;
}
function dirty(id) {
  return Object.keys(draft[id] || {}).length > 0;
}
function anyDirty() {
  return Object.keys(draft).some(dirty);
}
function activeModules() {
  return tab === 'all' ? modules : modules.filter((item) => item.id === tab);
}
function layoutValue(id, key) {
  return Object.hasOwn(draft[id] || {}, key) ? draft[id][key] : base[id]?.[key];
}
function fieldKeys(id, key) {
  if (id === 'football') return { position: key + '_pos', size: key + '_scale' };
  if (id === 'stage')
    return {
      x: key + 'X',
      y: key + 'Y',
      size:
        key === 'lower'
          ? 'lowerWidth'
          : ['channel', 'event', 'sponsor'].includes(key)
            ? 'logoSize'
            : null,
    };
  return { x: 'x', y: 'y', size: 'scale' };
}
function currentElement() {
  const [id, key] = selected.split(':');
  return id && key ? { id, key, fields: fieldKeys(id, key) } : null;
}
function coordinate(element) {
  const { id, fields } = element;
  return fields.position
    ? layoutValue(id, fields.position)
    : { x: layoutValue(id, fields.x), y: layoutValue(id, fields.y) };
}
function setDraft(id, key, value) {
  if (!draft[id]) draft[id] = {};
  if (JSON.stringify(value) === JSON.stringify(base[id][key])) delete draft[id][key];
  else draft[id][key] = value;
  sendDraft(id);
}
function sendDraft(id) {
  const frame = $('pvwCanvas').querySelector('iframe[data-module="' + id + '"]');
  const module = modules.find((item) => item.id === id);
  if (frame && module)
    frame.contentWindow.postMessage(
      { type: 'preview-layout', module: id, layout: draft[id] || {} },
      module.url,
    );
}
function updateActions() {
  const pending = anyDirty();
  $('pending').hidden = !pending;
  $('draftStatus').textContent = pending ? '调整尚未应用' : '与播出位置一致';
  $('apply').disabled = !pending || busy;
  $('reset').disabled = !pending || busy;
}
function limits(element) {
  if (element.id === 'football')
    return { minX: 0, maxX: 1920, minY: 0, maxY: 1080, minSize: 0.3, maxSize: 3, step: 0.01 };
  if (element.id === 'ae-live')
    return {
      minX: -1920,
      maxX: 1920,
      minY: -1080,
      maxY: 1080,
      minSize: 0.1,
      maxSize: 3,
      step: 0.01,
    };
  const lower = element.key === 'lower',
    caption = element.key === 'caption';
  return {
    minX: 0,
    maxX: lower ? Math.min(1520, 1920 - layoutValue('stage', 'lowerWidth')) : 1620,
    minY: 0,
    maxY: lower ? 900 : caption ? 1020 : 880,
    minSize: lower ? 400 : 40,
    maxSize: lower ? Math.min(1728, 1920 - coordinate(element).x) : 300,
    step: 1,
  };
}
function fillControls() {
  const element = currentElement(),
    enabled = Boolean(element && base[element.id]) && view !== 'pgm' && !busy;
  for (const id of ['x', 'y', 'size']) $(id).disabled = !enabled;
  $('element').disabled = !element || busy;
  if (!element || !base[element.id]) {
    $('x').value = '';
    $('y').value = '';
    $('size').value = '';
    $('sizeLabel').hidden = true;
    updateActions();
    return;
  }
  const point = coordinate(element),
    range = limits(element);
  for (const axis of ['x', 'y']) {
    $(axis).value = Math.round(point[axis]);
    $(axis).min = range['min' + axis.toUpperCase()];
    $(axis).max = range['max' + axis.toUpperCase()];
  }
  $('sizeLabel').hidden = !element.fields.size;
  if (element.fields.size) {
    $('size').value = layoutValue(element.id, element.fields.size);
    $('size').min = range.minSize;
    $('size').max = range.maxSize;
    $('size').step = range.step;
    $('sizeLabel').firstChild.textContent = element.id === 'stage' ? '宽度 / 尺寸' : '缩放';
  }
  updateActions();
}
function setPoint(point) {
  if (busy) return;
  const element = currentElement();
  if (!element || !base[element.id]) return;
  const range = limits(element);
  const x = Math.round(Math.max(range.minX, Math.min(range.maxX, point.x)));
  const y = Math.round(Math.max(range.minY, Math.min(range.maxY, point.y)));
  if (element.fields.position) setDraft(element.id, element.fields.position, { x, y });
  else {
    setDraft(element.id, element.fields.x, x);
    setDraft(element.id, element.fields.y, y);
  }
  fillControls();
  drawHandle();
}
function drawHandle() {
  const host = $('handles');
  host.replaceChildren();
  const element = currentElement();
  if (!element || !base[element.id] || view === 'pgm' || busy) return;
  const point = coordinate(element),
    box = boxes[element.id]?.[element.key];
  const width = Math.max(
    120,
    Math.min(
      1920,
      box?.width || (element.id === 'ae-live' ? 1920 * layoutValue(element.id, 'scale') : 220),
    ),
  );
  const height = Math.max(
    60,
    Math.min(
      1080,
      box?.height || (element.id === 'ae-live' ? 1080 * layoutValue(element.id, 'scale') : 100),
    ),
  );
  const handle = document.createElement('div');
  handle.className = 'handle';
  handle.dataset.label =
    names[element.id] +
    ' · ' +
    (definitions[element.id].find(([key]) => key === element.key)?.[1] || '');
  handle.style.left =
    (Number.isFinite(box?.x) && box.width
      ? box.x
      : point.x - (element.id === 'football' ? width / 2 : 0)) + 'px';
  handle.style.top =
    (Number.isFinite(box?.y) && box.height
      ? box.y
      : point.y - (element.id === 'football' ? height / 2 : 0)) + 'px';
  handle.style.width = width + 'px';
  handle.style.height = height + 'px';
  handle.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, point: coordinate(element) };
    const move = (ev) =>
      setPoint({
        x: start.point.x + (ev.clientX - start.x) / scales.pvw,
        y: start.point.y + (ev.clientY - start.y) / scales.pvw,
      });
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  host.append(handle);
}
function resize() {
  for (const kind of ['pvw', 'pgm']) {
    const width = $(kind + 'Wrap').clientWidth;
    if (!width) continue;
    scales[kind] = width / 1920;
    $(kind + 'Canvas').style.transform = 'scale(' + scales[kind] + ')';
  }
}
new ResizeObserver(resize).observe($('screens'));
function renderTabs() {
  $('tabs').replaceChildren();
  for (const item of [{ id: 'all', name: '全部模块' }, ...modules]) {
    const button = document.createElement('button');
    button.textContent = item.name;
    button.dataset.tab = item.id;
    button.setAttribute('aria-pressed', String(item.id === tab));
    button.onclick = () => {
      tab = item.id;
      selected = '';
      renderTabs();
      renderScreens();
    };
    $('tabs').append(button);
  }
}
function outputUrl(module, kind) {
  const route =
    module.id === 'football'
      ? '/titles/graphics.html'
      : module.id === 'stage'
        ? '/stage/graphics.html'
        : '/ae/graphics.html';
  return module.url + route + (kind === 'pvw' ? '?workspacePreview=1' : '');
}
function renderScreens() {
  const active = activeModules();
  $('pvwPanel').hidden = view === 'pgm';
  $('pgmPanel').hidden = view === 'pvw';
  $('screens').classList.toggle('single', view !== 'dual');
  $('screenNote').hidden = tab !== 'all';
  for (const kind of ['pvw', 'pgm']) {
    const canvas = $(kind + 'Canvas');
    canvas.querySelectorAll('iframe').forEach((frame) => frame.remove());
    if ((kind === 'pvw' && view === 'pgm') || (kind === 'pgm' && view === 'pvw')) continue;
    for (const module of active) {
      const frame = document.createElement('iframe');
      frame.setAttribute('allowtransparency', 'true');
      frame.dataset.module = module.id;
      frame.title = names[module.id] + (kind === 'pvw' ? '预览' : '播出');
      frame.src = outputUrl(module, kind);
      if (kind === 'pvw') {
        frame.onload = () => sendDraft(module.id);
        canvas.insertBefore(frame, $('handles'));
      } else canvas.append(frame);
    }
  }
  const options = active.flatMap((module) =>
    definitions[module.id].map(([key, label]) => ({
      value: module.id + ':' + key,
      label: module.name + ' · ' + label,
    })),
  );
  $('element').replaceChildren(...options.map((item) => new Option(item.label, item.value)));
  if (!options.some((item) => item.value === selected)) selected = options[0]?.value || '';
  $('element').value = selected;
  fillControls();
  drawHandle();
  requestAnimationFrame(resize);
}
async function refresh() {
  if (document.hidden || busy) return;
  try {
    const model = await api('/api/workspace');
    const next = order
      .map((id) => model.modules.find((item) => item.id === id && item.enabled))
      .filter(Boolean);
    const changed =
      JSON.stringify(next.map((item) => [item.id, item.url])) !==
      JSON.stringify(modules.map((item) => [item.id, item.url]));
    modules = next;
    if (tab !== 'all' && !modules.some((item) => item.id === tab)) tab = 'all';
    for (const module of modules) {
      const current = (await api('/api/workspace/layout/' + module.id)).layout;
      if (!base[module.id]) base[module.id] = current;
      else
        for (const key of Object.keys(current))
          if (!Object.hasOwn(draft[module.id] || {}, key)) base[module.id][key] = current[key];
    }
    if (changed) {
      renderTabs();
      renderScreens();
    } else {
      if (!['x', 'y', 'size'].includes(document.activeElement?.id)) fillControls();
      drawHandle();
    }
    if (!modules.length) $('notice').textContent = '请先在主窗口加载需要的模块。';
  } catch (error) {
    $('notice').textContent = '预览暂不可用：' + error.message;
  }
}
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'preview-geometry') return;
  const module = modules.find((item) => item.id === event.data.module && item.url === event.origin);
  const frame = module && $('pvwCanvas').querySelector('iframe[data-module="' + module.id + '"]');
  if (!frame || frame.contentWindow !== event.source) return;
  boxes[module.id] = event.data.boxes || {};
  if (currentElement()?.id === module.id) drawHandle();
});
$('element').onchange = () => {
  selected = $('element').value;
  fillControls();
  drawHandle();
};
for (const axis of ['x', 'y'])
  $(axis).onchange = () => {
    const element = currentElement(),
      point = element && coordinate(element),
      value = Number($(axis).value);
    if (point && Number.isFinite(value) && $(axis).value !== '')
      setPoint({ ...point, [axis]: value });
    else fillControls();
  };
$('size').onchange = () => {
  const element = currentElement(),
    range = element && limits(element),
    value = Number($('size').value);
  if (element?.fields.size && $('size').value !== '' && Number.isFinite(value)) {
    setDraft(
      element.id,
      element.fields.size,
      Math.max(range.minSize, Math.min(range.maxSize, value)),
    );
    fillControls();
    drawHandle();
  } else fillControls();
};
document.querySelectorAll('[data-view]').forEach(
  (button) =>
    (button.onclick = () => {
      view = button.dataset.view;
      document
        .querySelectorAll('[data-view]')
        .forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      renderScreens();
    }),
);
$('reset').onclick = async () => {
  for (const id of Object.keys(draft)) delete draft[id];
  await refresh();
  for (const module of modules) sendDraft(module.id);
  $('notice').textContent = '已恢复当前播出位置。';
  fillControls();
  drawHandle();
};
$('apply').onclick = async () => {
  busy = true;
  fillControls();
  drawHandle();
  $('notice').textContent = '正在应用…';
  try {
    for (const id of order.filter(dirty)) {
      const values = draft[id],
        prior = Object.fromEntries(Object.keys(values).map((key) => [key, base[id][key]]));
      const result = await api('/api/workspace/layout/' + id, { base: prior, draft: values });
      base[id] = result.layout;
      delete draft[id];
      sendDraft(id);
    }
    $('notice').textContent = '已应用到播出画面。';
  } catch (error) {
    $('notice').textContent = error.message + '；未成功的调整仍保留在 PVW。';
  } finally {
    busy = false;
    fillControls();
    drawHandle();
  }
};
renderTabs();
renderScreens();
refresh();
timer = setInterval(refresh, 3000);
window.addEventListener('pagehide', () => clearInterval(timer));
