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
    ['event', '活动logo'],
    ['caption', '字幕条'],
  ],
  'stage-promotion': [
    ['list', '名单层'],
    ['background', '参考背景（仅预览）'],
  ],
  'ae-live': [['frame', 'AE 画面']],
};
const names = {
  football: '足球赛事',
  stage: '舞台节目',
  'stage-promotion': '晋级名单',
  'ae-live': 'AE 直播连接',
};
const order = ['football', 'stage', 'ae-live'];
const layoutOrder = ['football', 'stage', 'stage-promotion', 'ae-live'];
const base = {},
  draft = {},
  boxes = {};
let modules = [],
  tab = new URLSearchParams(location.search).get('module') || 'all';
let inspectorOpen = true;
let stageCaptionSelection;
let promotionPreviewRound;
const pixelRatioLocks = {};
let view = 'dual',
  selected = '',
  busy = false,
  scales = { pvw: 1, pgm: 1 },
  timer;
try {
  const preferred = localStorage.getItem('workspace-preview-default');
  if (['dual', 'pvw', 'pgm'].includes(preferred)) view = preferred;
} catch {}

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
function referenceOnly(ids) {
  return (
    ids.length === 1 &&
    ids[0] === 'stage-promotion' &&
    Object.keys(draft['stage-promotion']).every((key) => key.startsWith('promotionBackground'))
  );
}
function activeModules() {
  return tab === 'all' ? modules : previewTabs().filter((item) => item.id === tab);
}
function previewTabs() {
  return modules.flatMap((module) =>
    module.id === 'stage'
      ? [module, { id: 'stage-promotion', url: module.url, name: names['stage-promotion'] }]
      : [module],
  );
}
function layoutValue(id, key) {
  return Object.hasOwn(draft[id] || {}, key) ? draft[id][key] : base[id]?.[key];
}
function fieldKeys(id, key) {
  if (id === 'football') return { position: key + '_pos', size: key + '_scale' };
  if (id === 'stage-promotion') {
    const prefix = key === 'list' ? 'promotionList' : 'promotionBackground';
    return {
      x: prefix + 'X',
      y: prefix + 'Y',
      width: prefix + 'Width',
      height: prefix + 'Height',
    };
  }
  if (id === 'stage')
    return {
      x: key + 'X',
      y: key + 'Y',
      ...(['channel', 'event'].includes(key) && { width: key + 'Width', height: key + 'Height' }),
    };
  return { x: 'x', y: 'y', size: 'scale' };
}
function currentElement() {
  const [id, key] = selected.split(':');
  return id && key ? { id, key, fields: fieldKeys(id, key) } : null;
}
function coordinate(element) {
  const { id, key, fields } = element;
  if (fields.position) return layoutValue(id, fields.position);
  const y = layoutValue(id, fields.y);
  return { x: layoutValue(id, fields.x), y: y ?? boxes[id]?.[key]?.y ?? 0 };
}
function setDraft(id, key, value) {
  setDraftFields(id, { [key]: value });
}
function setDraftFields(id, fields) {
  if (!draft[id]) draft[id] = {};
  for (const [key, value] of Object.entries(fields)) {
    if (JSON.stringify(value) === JSON.stringify(base[id][key])) delete draft[id][key];
    else draft[id][key] = value;
  }
  sendDraft(id);
}
function sendDraft(id) {
  const frame = $('pvwCanvas').querySelector('iframe[data-module="' + id + '"]');
  const module = activeModules().find((item) => item.id === id);
  if (frame && module)
    frame.contentWindow.postMessage(
      {
        type: 'preview-layout',
        module: id,
        layout: draft[id] || {},
        ...(id === 'stage' && { captionTemplateId: base.stage?.captionTemplateId }),
        presentation: window.previewTools?.presentation(id),
      },
      module.url,
    );
}
function updateActions() {
  const ids = layoutOrder.filter(dirty);
  const pending = ids.length > 0;
  $('pending').hidden = !pending;
  $('draftStatus').textContent = pending ? '调整尚未应用' : '与播出位置一致';
  $('apply').textContent = referenceOnly(ids) ? '应用到预监' : '应用到播出';
  $('apply').disabled = !pending || busy;
  $('reset').disabled = !pending || busy;
}
function flexibleSize(element) {
  return Boolean(element?.fields.width);
}
function pixelSize(element) {
  return {
    width: layoutValue(element.id, element.fields.width),
    height: layoutValue(element.id, element.fields.height),
  };
}
function setPixelSize(element, width, height) {
  if (busy || !flexibleSize(element) || !base[element.id]) return;
  if (![width, height].every((size) => Number.isFinite(size) && size > 0)) {
    $('notice').textContent = '宽度和高度要大于 0。';
    return;
  }
  setDraftFields(element.id, { [element.fields.width]: width, [element.fields.height]: height });
}
function relativeSize(initial, stops) {
  const value = Math.min(Number.MAX_VALUE, Math.max(Number.MIN_VALUE, initial * 2 ** stops));
  return roundedPixels(value);
}
function roundedPixels(value) {
  return value >= 0.01 && value < 1e12 ? Math.round(value * 100) / 100 : value;
}
function setSize(element, value) {
  if (busy || !element?.fields.size || !base[element.id] || !Number.isFinite(value)) return;
  const { minSize, maxSize } = limits(element);
  setDraft(element.id, element.fields.size, Math.max(minSize, Math.min(maxSize, value)));
}
function limits(element) {
  if (element.id === 'stage-promotion') return { minX: -1920, maxX: 1920, minY: -1080, maxY: 1080 };
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
  const caption = element.key === 'caption';
  if (caption && base.stage?.captionTemplateId)
    return { minX: -1920, maxX: 1920, minY: -1080, maxY: 1080 };
  return {
    minX: 0,
    maxX: 1620,
    minY: 0,
    maxY: caption ? 1020 : 880,
  };
}
function fillControls() {
  const element = currentElement(),
    enabled = Boolean(element && base[element.id]) && view !== 'pgm' && !busy;
  const promotionList = element?.fields.y === 'promotionListY';
  $('y').placeholder = promotionList ? '自动居中' : '';
  $('y').title = promotionList ? '留空使用自动竖向居中，输入数值固定 Y' : '';
  for (const id of ['x', 'y', 'size']) $(id).disabled = !enabled;
  $('element').disabled = !element || busy;
  $('pixelSizeFields').hidden = !flexibleSize(element);
  if (flexibleSize(element)) {
    const size = pixelSize(element);
    $('pixelWidthLabel').textContent = promotionList ? '基准宽度（px）' : '宽度（px）';
    $('pixelHeightLabel').textContent =
      element.id === 'stage-promotion' && element.key === 'list' ? '可用高度（px）' : '高度（px）';
    for (const [id, key] of [
      ['pixelWidth', 'width'],
      ['pixelHeight', 'height'],
    ]) {
      $(id).disabled = !enabled;
      $(id).value = size[key] ?? '';
    }
    $('lockPixelRatio').disabled = !enabled;
    $('lockPixelRatio').checked = pixelRatioLocks[selected] !== false;
  }
  const captionSelection = $('captionLayoutTemplate');
  const choices = base.stage?.captionChoices || [];
  $('captionLayoutTemplateLabel').hidden = !(
    element?.id === 'stage' &&
    element.key === 'caption' &&
    choices.length
  );
  if (!$('captionLayoutTemplateLabel').hidden) {
    const options = [
      new Option('当前字幕模板', 'auto'),
      new Option('内置字幕', 'builtin'),
      ...choices.map(({ id, name }) => new Option(name, 'custom:' + id)),
    ];
    const signature = JSON.stringify(options.map(({ value, text }) => [value, text]));
    if (captionSelection.dataset.options !== signature) {
      captionSelection.replaceChildren(...options);
      captionSelection.dataset.options = signature;
    }
    captionSelection.value =
      stageCaptionSelection === undefined
        ? 'auto'
        : stageCaptionSelection
          ? 'custom:' + stageCaptionSelection
          : 'builtin';
    captionSelection.disabled = busy || hasCaptionDraft();
  }
  if (!element || !base[element.id]) {
    $('x').value = '';
    $('y').value = '';
    $('size').value = '';
    $('sizeLabel').hidden = true;
    updateActions();
    window.previewTools?.sync();
    return;
  }
  const point = coordinate(element),
    range = limits(element);
  for (const axis of ['x', 'y']) {
    $(axis).value =
      promotionList && axis === 'y' && layoutValue(element.id, element.fields.y) === null
        ? ''
        : Math.round(point[axis]);
    $(axis).min = range['min' + axis.toUpperCase()];
    $(axis).max = range['max' + axis.toUpperCase()];
  }
  $('sizeLabel').hidden = !element.fields.size;
  if (element.fields.size) {
    $('size').value = layoutValue(element.id, element.fields.size);
    $('size').min = range.minSize;
    $('size').max = range.maxSize;
    $('size').step = range.step;
  }
  updateActions();
  window.previewTools?.sync();
}
function setPoint(point, fixY = false) {
  if (busy) return;
  const element = currentElement();
  if (!element || !base[element.id]) return;
  const range = limits(element);
  const keepAutoY =
    element.fields.y === 'promotionListY' &&
    layoutValue(element.id, element.fields.y) === null &&
    !fixY &&
    Math.abs(point.y - coordinate(element).y) < 0.5;
  point = window.previewTools?.snap(point) || point;
  const x = Math.round(Math.max(range.minX, Math.min(range.maxX, point.x)));
  const y = Math.round(Math.max(range.minY, Math.min(range.maxY, point.y)));
  if (element.fields.position) setDraft(element.id, element.fields.position, { x, y });
  else setDraftFields(element.id, { [element.fields.x]: x, [element.fields.y]: keepAutoY ? null : y });
  fillControls();
  drawHandle();
}
function drawHandle() {
  const host = $('handles');
  const restoreFocus = host.contains(document.activeElement);
  host.replaceChildren();
  const element = currentElement();
  if (!element || !base[element.id] || view === 'pgm' || busy) return;
  const point = coordinate(element),
    box = boxes[element.id]?.[element.key];
  let width = Math.max(
    120,
    Math.min(
      1920,
      box?.width || (element.id === 'ae-live' ? 1920 * layoutValue(element.id, 'scale') : 220),
    ),
  );
  let height = Math.max(
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
  let left =
    Number.isFinite(box?.x) && box.width
      ? box.x
      : point.x - (element.id === 'football' ? width / 2 : 0);
  let top =
    Number.isFinite(box?.y) && box.height
      ? box.y
      : point.y - (element.id === 'football' ? height / 2 : 0);
  if (flexibleSize(element)) {
    // Keep the corner reachable when the actual graphic extends past the preview edges.
    left = Math.max(0, left);
    top = Math.max(0, top);
    width = Math.min(width, 1908 - left);
    height = Math.min(height, 1068 - top);
  }
  handle.style.left = left + 'px';
  handle.style.top = top + 'px';
  handle.style.width = width + 'px';
  handle.style.height = height + 'px';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'group');
  handle.setAttribute('aria-label', handle.dataset.label + '，方向键微调位置');
  handle.onkeydown = (event) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ];
    if (!delta) return;
    event.preventDefault();
    const p = coordinate(element),
      step = event.shiftKey ? 10 : 1;
    setPoint({ x: p.x + delta[0] * step, y: p.y + delta[1] * step });
    host.firstChild?.focus({ preventScroll: true });
  };
  handle.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    window.previewTools?.drag(true);
    const start = { x: event.clientX, y: event.clientY, point: coordinate(element) };
    const move = (ev) =>
      setPoint({
        x: start.point.x + (ev.clientX - start.x) / scales.pvw,
        y: start.point.y + (ev.clientY - start.y) / scales.pvw,
      });
    const end = () => {
      window.previewTools?.drag(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  if (element.fields.size || flexibleSize(element)) {
    const corner = document.createElement('span');
    corner.className = 'resize-handle';
    corner.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      const stagePixels = flexibleSize(element);
      const initial = stagePixels
        ? pixelSize(element)
        : layoutValue(element.id, element.fields.size);
      const startX = event.clientX,
        startY = event.clientY;
      const reference = Math.max(width * scales.pvw, 50);
      const lock = $('lockPixelRatio').checked;
      const move = (ev) => {
        const delta = (ev.clientX - startX) / reference;
        if (stagePixels) {
          const vertical = (ev.clientY - startY) / Math.max(height * scales.pvw, 50);
          const scale = Math.abs(delta) >= Math.abs(vertical) ? delta : vertical;
          setPixelSize(
            element,
            relativeSize(initial.width, lock ? scale : delta),
            relativeSize(initial.height, lock ? scale : vertical),
          );
        } else setSize(element, Math.round(initial * (1 + delta) * 100) / 100);
        fillControls();
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };
    handle.append(corner);
  }
  host.append(handle);
  if (restoreFocus) handle.focus({ preventScroll: true });
}
function resize() {
  for (const kind of ['pvw', 'pgm']) {
    const width = $(kind + 'Wrap').getBoundingClientRect().width;
    if (!width) continue;
    scales[kind] = width / 1920;
    $(kind + 'Canvas').style.zoom = scales[kind];
  }
}
const previewSize = new ResizeObserver(resize);
previewSize.observe($('pvwWrap'));
previewSize.observe($('pgmWrap'));
function renderTabs() {
  $('tabs').replaceChildren();
  for (const item of [{ id: 'all', name: '全部模块' }, ...previewTabs()]) {
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
  if (module.id === 'stage-promotion') {
    const query = new URLSearchParams({ workspacePreview: '1' });
    if (promotionPreviewRound !== undefined) query.set('round', promotionPreviewRound);
    return module.url + '/stage/promotion.html' + (kind === 'pvw' ? '?' + query : '');
  }
  const route =
    module.id === 'football'
      ? '/titles/graphics.html'
      : module.id === 'stage'
        ? '/stage/graphics.html'
        : '/ae/graphics.html';
  return module.url + route + (kind === 'pvw' ? '?workspacePreview=1' : '');
}
function renderInspector() {
  const hasLayout = view !== 'pgm';
  const visible = hasLayout && inspectorOpen;
  $('inspector').hidden = !visible;
  $('inspectorToggle').hidden = !hasLayout;
  $('inspectorToggle').setAttribute('aria-expanded', String(visible));
  document.querySelector('.editor-shell').classList.toggle('tools-collapsed', !visible);
}
function renderScreens() {
  const promotion = tab === 'stage-promotion';
  document
    .querySelectorAll('[data-view]')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  const active = activeModules();
  $('pvwPanel').hidden = view === 'pgm';
  $('pgmPanel').hidden = view === 'pvw';
  $('screens').classList.toggle('single', view !== 'dual');
  $('previewToolbar').hidden = view === 'pgm';
  $('previewModeLabel').hidden = promotion;
  $('promotionPreviewToolbar').hidden = view === 'pgm' || !promotion;
  $('previewFooter').hidden = view === 'pgm';
  renderInspector();
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
  window.previewTools?.render();
  if (promotion && view !== 'pgm') void refreshPromotionRounds();
  requestAnimationFrame(resize);
}
async function refreshPromotionRounds() {
  const stage = activeModules()[0];
  if (!stage) return;
  const picker = $('promotionPreviewRound');
  try {
    const { rounds, defaultRound } = await api(
      stage.url + '/api/stage/promotion-preview?choices=1',
    );
    if (tab !== 'stage-promotion' || stage.url !== activeModules()[0]?.url) return;
    const signature = JSON.stringify(rounds);
    if (picker.dataset.options !== signature) {
      picker.replaceChildren(
        ...(rounds.length
          ? rounds.map(({ id, name }) => new Option(name, id))
          : [new Option('暂无已保存名单', '')]),
      );
      picker.dataset.options = signature;
    }
    picker.disabled = !rounds.length;
    if (!rounds.some(({ id }) => id === promotionPreviewRound)) {
      if (promotionPreviewRound !== undefined) {
        promotionPreviewRound = undefined;
        const frame = $('pvwCanvas').querySelector('iframe[data-module="stage-promotion"]');
        if (frame) frame.src = outputUrl(stage, 'pvw');
      }
      picker.value = defaultRound ?? rounds[0]?.id ?? '';
    } else picker.value = promotionPreviewRound;
  } catch {
    if (tab !== 'stage-promotion') return;
    picker.replaceChildren(new Option('暂时无法读取名单', ''));
    picker.disabled = true;
    delete picker.dataset.options;
  }
}
$('promotionPreviewRound').onchange = () => {
  promotionPreviewRound = $('promotionPreviewRound').value;
  const frame = $('pvwCanvas').querySelector('iframe[data-module="stage-promotion"]');
  if (frame) frame.src = outputUrl(activeModules()[0], 'pvw');
};
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
    if (tab !== 'all' && !previewTabs().some((item) => item.id === tab)) tab = 'all';
    for (const module of previewTabs()) {
      const target =
        module.id === 'stage'
          ? hasCaptionDraft()
            ? base.stage.captionTemplateId
            : stageCaptionSelection
          : undefined;
      const query =
        target === undefined ? '' : '?' + new URLSearchParams({ captionTemplate: target });
      const current = (await api('/api/workspace/layout/' + module.id + query)).layout;
      const previousTarget = base[module.id]?.captionTemplateId;
      if (!base[module.id]) base[module.id] = current;
      else
        for (const key of Object.keys(current)) {
          const pending = draft[module.id] || {};
          if (key === 'scoreboardTemplate' && Object.keys(pending).length) continue;
          if (!Object.hasOwn(pending, key)) base[module.id][key] = current[key];
        }
      if (module.id === 'stage' && previousTarget !== current.captionTemplateId) sendDraft('stage');
    }
    if (changed) {
      renderTabs();
      renderScreens();
    } else {
      if (tab === 'stage-promotion' && view !== 'pgm') void refreshPromotionRounds();
      if (
        !['x', 'y', 'size', 'sizeSlider', 'pixelWidth', 'pixelHeight'].includes(
          document.activeElement?.id,
        )
      )
        fillControls();
      drawHandle();
    }
    if (!modules.length) $('notice').textContent = '请先在主窗口加载需要的模块。';
  } catch (error) {
    $('notice').textContent = '预览暂不可用：' + error.message;
  }
}
function hasCaptionDraft() {
  return ['captionX', 'captionY'].some((key) => Object.hasOwn(draft.stage || {}, key));
}
$('captionLayoutTemplate').onchange = async () => {
  const selector = $('captionLayoutTemplate');
  const value = selector.value;
  stageCaptionSelection = value === 'auto' ? undefined : value === 'builtin' ? '' : value.slice(7);
  const mode = $('previewMode');
  mode.value = 'layout';
  mode.dispatchEvent(new Event('change'));
  await refresh();
  sendDraft('stage');
};
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'preview-geometry') return;
  const module = activeModules().find(
    (item) => item.id === event.data.module && item.url === event.origin,
  );
  const frame = module && $('pvwCanvas').querySelector('iframe[data-module="' + module.id + '"]');
  if (!frame || frame.contentWindow !== event.source) return;
  boxes[module.id] = event.data.boxes || {};
  if (currentElement()?.id === module.id) drawHandle();
});
$('element').onchange = () => {
  selected = $('element').value;
  fillControls();
  drawHandle();
  window.previewTools?.selectionChanged();
};
for (const axis of ['x', 'y'])
  $(axis).onchange = () => {
    const input = $(axis);
    if (input.validity.badInput) return fillControls();
    const element = currentElement(),
      point = element && coordinate(element),
      value = Number(input.value);
    if (!busy && axis === 'y' && element?.fields.y === 'promotionListY' && input.value === '') {
      setDraft(element.id, element.fields.y, null);
      fillControls();
      drawHandle();
    } else if (point && Number.isFinite(value) && input.value !== '')
      setPoint({ ...point, [axis]: value }, axis === 'y');
    else fillControls();
  };
$('size').onchange = () => {
  if ($('size').value !== '') setSize(currentElement(), $('size').valueAsNumber);
  fillControls();
  drawHandle();
};
$('lockPixelRatio').onchange = () => {
  pixelRatioLocks[selected] = $('lockPixelRatio').checked;
};
for (const [id, key] of [
  ['pixelWidth', 'width'],
  ['pixelHeight', 'height'],
]) {
  $(id).onchange = () => {
    const element = currentElement();
    if (!flexibleSize(element)) return;
    const size = pixelSize(element);
    const value = $(id).valueAsNumber;
    const factor = value / size[key];
    const lock = $('lockPixelRatio').checked;
    const width = key === 'width' ? value : lock ? roundedPixels(size.width * factor) : size.width;
    const height =
      key === 'height' ? value : lock ? roundedPixels(size.height * factor) : size.height;
    setPixelSize(element, width, height);
    fillControls();
    drawHandle();
  };
}
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
  for (const module of activeModules()) sendDraft(module.id);
  $('notice').textContent = '已恢复当前播出位置。';
  fillControls();
  drawHandle();
};
$('apply').onclick = async () => {
  const ids = layoutOrder.filter(dirty);
  const onlyPreview = referenceOnly(ids);
  busy = true;
  fillControls();
  drawHandle();
  $('notice').textContent = '正在应用…';
  try {
    for (const id of ids) {
      const values = draft[id],
        prior = Object.fromEntries(Object.keys(values).map((key) => [key, base[id][key]]));
      const result = await api('/api/workspace/layout/' + id, {
        base: prior,
        draft: values,
        ...(id === 'football' && { scoreboardTemplate: base[id].scoreboardTemplate }),
        ...(id === 'stage' && { captionTemplateId: base.stage.captionTemplateId }),
      });
      base[id] = result.layout;
      delete draft[id];
      sendDraft(id);
    }
    $('notice').textContent = onlyPreview ? '已应用到预监画面。' : '已应用到播出画面。';
  } catch (error) {
    $('notice').textContent = error.message + '；未成功的调整仍保留在 PVW。';
  } finally {
    busy = false;
    fillControls();
    drawHandle();
  }
};
$('inspectorToggle').onclick = () => {
  inspectorOpen = !inspectorOpen;
  renderInspector();
  requestAnimationFrame(resize);
};
renderTabs();
renderScreens();
refresh();
timer = setInterval(refresh, 3000);
window.addEventListener('pagehide', () => clearInterval(timer));
