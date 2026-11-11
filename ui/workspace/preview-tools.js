'use strict';
// These are monitor preferences. Only preview.js can apply a layout to output.
(() => {
  const storageKey = 'broadcast-preview-tools-v1';
  const defaults = {
    ratio: '16:9',
    ratioWidth: 16,
    ratioHeight: 9,
    guides: true,
    grid: false,
    snap: false,
    step: 20,
    align: 'title',
    background: 'checker',
    hidden: {},
  };
  let prefs = { ...defaults },
    dragging = false,
    only = '',
    mode = 'live';
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    prefs = {
      ...defaults,
      ...value,
      hidden: value.hidden && typeof value.hidden === 'object' ? value.hidden : {},
    };
  } catch (_) {
    /* A blocked or full preference store does not stop preview. */
  }
  if (!['16:9', '4:3', '1:1', '9:16', '21:9', 'custom'].includes(prefs.ratio))
    prefs.ratio = defaults.ratio;
  if (!['title', 'action', 'frame'].includes(prefs.align)) prefs.align = defaults.align;
  if (!['checker', 'pitch', 'dark', 'light'].includes(prefs.background))
    prefs.background = defaults.background;
  prefs.step = Math.max(5, Math.min(200, Number(prefs.step) || 20));
  for (const key of ['ratioWidth', 'ratioHeight'])
    prefs[key] = Math.max(1, Math.min(100, Number(prefs[key]) || defaults[key]));
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch (_) {}
  }
  function entries() {
    return activeModules().flatMap((module) =>
      definitions[module.id].map(([key, label]) => ({
        id: module.id,
        key,
        value: module.id + ':' + key,
        label,
        name: module.name,
      })),
    );
  }
  function broadcast() {
    for (const module of modules) sendDraft(module.id);
  }
  function presentation(id) {
    return {
      mode,
      only: only ? (only.startsWith(id + ':') ? only.split(':')[1] : '__none__') : '',
      hidden: definitions[id].filter(([key]) => prefs.hidden[id + ':' + key]).map(([key]) => key),
    };
  }
  function frameRect() {
    const [w, h] =
      prefs.ratio === 'custom'
        ? [prefs.ratioWidth, prefs.ratioHeight]
        : prefs.ratio.split(':').map(Number);
    const width = Math.min(1920, (1080 * w) / h),
      height = (width * h) / w;
    return { x: (1920 - width) / 2, y: (1080 - height) / 2, width, height };
  }
  function inset(rect, amount) {
    return {
      x: rect.x + (rect.width * (1 - amount)) / 2,
      y: rect.y + (rect.height * (1 - amount)) / 2,
      width: rect.width * amount,
      height: rect.height * amount,
    };
  }
  function place(node, rect) {
    Object.assign(node.style, {
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }
  function guides() {
    let root = $('pvwCanvas').querySelector('.preview-guides');
    if (!root) {
      root = document.createElement('div');
      root.className = 'preview-guides';
      root.setAttribute('aria-hidden', 'true');
      for (const [cls, label] of [
        ['composition-frame', '构图范围'],
        ['preview-grid', ''],
        ['center-lines', ''],
        ['safe-frame action-safe', '画面安全 95%'],
        ['safe-frame title-safe', '文字安全 90%'],
      ]) {
        const node = document.createElement('div');
        node.className = cls;
        if (label) {
          const caption = document.createElement('span');
          caption.className = 'guide-label';
          caption.textContent = label;
          node.append(caption);
        }
        root.append(node);
      }
    }
    $('pvwCanvas').insertBefore(root, $('handles'));
    const rect = frameRect();
    for (const cls of ['composition-frame', 'preview-grid', 'center-lines'])
      place(root.querySelector('.' + cls), rect);
    place(root.querySelector('.action-safe'), inset(rect, 0.95));
    place(root.querySelector('.title-safe'), inset(rect, 0.9));
    root.querySelector('.composition-frame').hidden = !prefs.guides && prefs.ratio === '16:9';
    root.querySelector('.composition-frame .guide-label').textContent =
      (prefs.ratio === 'custom' ? prefs.ratioWidth + ':' + prefs.ratioHeight : prefs.ratio) +
      ' · 构图范围';
    for (const cls of ['action-safe', 'title-safe', 'center-lines'])
      root.querySelector('.' + cls).hidden = !prefs.guides;
    const grid = root.querySelector('.preview-grid');
    grid.hidden = !prefs.grid && !dragging;
    grid.style.backgroundSize = prefs.step + 'px ' + prefs.step + 'px';
    for (const wrap of [$('pvwWrap'), $('pgmWrap')]) wrap.dataset.background = prefs.background;
  }
  function choose(value, solo = false) {
    selected = value;
    $('element').value = value;
    if (solo || only) {
      only = value;
      mode = 'layout';
      $('previewMode').value = mode;
      broadcast();
    }
    fillControls();
    drawHandle();
    renderSelection();
  }
  function renderSelection() {
    document
      .querySelectorAll('#categoryTabs [data-element]')
      .forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.element === only)));
    document
      .querySelectorAll('#layerList [data-element]')
      .forEach((node) =>
        node.setAttribute('aria-pressed', String(node.dataset.element === selected)),
      );
    $('modeHint').textContent =
      mode === 'layout'
        ? '排版预览：含未上屏元素，缺失内容以示例显示 · PGM 不受影响'
        : 'PVW 跟随播出 · 栏目开关仅作用于预览';
  }
  function render() {
    const items = entries();
    if (only && !items.some((item) => item.value === only)) only = '';
    $('categoryTabs').replaceChildren();
    $('layerList').replaceChildren();
    const all = document.createElement('button');
    all.textContent = '综合排版';
    all.dataset.element = '';
    all.onclick = () => {
      only = '';
      mode = 'layout';
      $('previewMode').value = mode;
      broadcast();
      renderSelection();
      drawHandle();
    };
    $('categoryTabs').append(all);
    for (const item of items) {
      const button = document.createElement('button');
      button.textContent = tab === 'all' ? item.name + ' · ' + item.label : item.label;
      button.dataset.element = item.value;
      button.onclick = () => choose(item.value, true);
      $('categoryTabs').append(button);
      const row = document.createElement('div');
      row.className = 'layer-row';
      const pick = document.createElement('button');
      pick.textContent = item.label;
      pick.title = item.name + ' · ' + item.label;
      pick.dataset.element = item.value;
      pick.onclick = () => choose(item.value);
      const label = document.createElement('label');
      label.className = 'switch-row';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = !prefs.hidden[item.value];
      toggle.setAttribute('aria-label', '预览中显示' + item.name + item.label);
      toggle.onchange = () => {
        prefs.hidden[item.value] = !toggle.checked;
        save();
        sendDraft(item.id);
        drawHandle();
      };
      label.append(toggle);
      row.append(pick, label);
      $('layerList').append(row);
    }
    guides();
    renderSelection();
    sync();
    broadcast();
  }
  function sync() {
    const item = currentElement(),
      enabled = Boolean(item && base[item.id]) && view !== 'pgm' && !busy;
    $('anchorHint').textContent =
      item?.id === 'football' ? 'X / Y · 元素中心坐标' : 'X / Y · 左上角坐标';
    $('restoreElement').disabled = !enabled;
    $('sizeSlider').hidden = !item?.fields.size;
    $('sizeSlider').disabled = !enabled;
    if (item?.fields.size && base[item.id]) {
      const range = limits(item);
      $('sizeSlider').min = range.minSize;
      $('sizeSlider').max = range.maxSize;
      $('sizeSlider').step = range.step;
      $('sizeSlider').value = layoutValue(item.id, item.fields.size);
    }
    document.querySelectorAll('[data-align]').forEach((node) => (node.disabled = !enabled));
    renderSelection();
  }
  function snap(point) {
    if (!dragging || !prefs.snap) return point;
    const rect = frameRect();
    return {
      x: rect.x + Math.round((point.x - rect.x) / prefs.step) * prefs.step,
      y: rect.y + Math.round((point.y - rect.y) / prefs.step) * prefs.step,
    };
  }
  $('previewMode').onchange = () => {
    mode = $('previewMode').value;
    only = '';
    broadcast();
    renderSelection();
    drawHandle();
  };
  $('sizeSlider').oninput = () => {
    $('size').value = $('sizeSlider').value;
    $('size').dispatchEvent(new Event('change'));
  };
  $('restoreElement').onclick = () => {
    const item = currentElement();
    if (!item || !base[item.id]) return;
    for (const key of Object.values(item.fields).filter(Boolean))
      if (draft[item.id]) delete draft[item.id][key];
    sendDraft(item.id);
    fillControls();
    drawHandle();
  };
  document.querySelectorAll('[data-align]').forEach(
    (button) =>
      (button.onclick = () => {
        const item = currentElement();
        if (!item || !base[item.id]) return;
        const point = coordinate(item),
          box = boxes[item.id]?.[item.key];
        if (!box?.width || !box?.height) {
          $('notice').textContent = '请先选择对应栏目进入排版预览，再进行对齐。';
          return;
        }
        const rect = inset(
          frameRect(),
          prefs.align === 'frame' ? 1 : prefs.align === 'action' ? 0.95 : 0.9,
        );
        const targets = {
          left: [rect.x - box.x, 0],
          centerX: [rect.x + (rect.width - box.width) / 2 - box.x, 0],
          right: [rect.x + rect.width - box.width - box.x, 0],
          top: [0, rect.y - box.y],
          centerY: [0, rect.y + (rect.height - box.height) / 2 - box.y],
          bottom: [0, rect.y + rect.height - box.height - box.y],
        };
        const [dx, dy] = targets[button.dataset.align];
        setPoint({ x: point.x + dx, y: point.y + dy });
      }),
  );
  $('showAllLayers').onclick = () => {
    for (const item of entries()) delete prefs.hidden[item.value];
    save();
    render();
  };
  const fields = {
    compositionRatio: 'ratio',
    ratioWidth: 'ratioWidth',
    ratioHeight: 'ratioHeight',
    showGuides: 'guides',
    showGrid: 'grid',
    snapGrid: 'snap',
    gridStep: 'step',
    alignTo: 'align',
    previewBackground: 'background',
  };
  for (const [id, key] of Object.entries(fields)) {
    const input = $(id);
    if (input.type === 'checkbox') input.checked = prefs[key];
    else input.value = prefs[key];
    input.onchange = () => {
      if (input.type === 'checkbox') prefs[key] = input.checked;
      else if (input.type === 'number') {
        const number = Number(input.value);
        prefs[key] = Number.isFinite(number)
          ? Math.max(Number(input.min), Math.min(Number(input.max), number))
          : defaults[key];
        input.value = prefs[key];
      } else prefs[key] = input.value;
      $('customRatio').hidden = prefs.ratio !== 'custom';
      save();
      guides();
    };
  }
  $('customRatio').hidden = prefs.ratio !== 'custom';
  $('inspectorToggle').onclick = () => {
    const shown = $('inspector').hidden;
    $('inspector').hidden = !shown;
    document.querySelector('.editor-shell').classList.toggle('tools-collapsed', !shown);
    $('inspectorToggle').setAttribute('aria-expanded', String(shown));
    requestAnimationFrame(resize);
  };
  $('reloadFrames').onclick = () => renderScreens();
  window.previewTools = {
    render,
    renderSelection,
    sync,
    presentation,
    snap,
    selectionChanged() {
      if (only) {
        only = selected;
        broadcast();
      }
      renderSelection();
    },
    drag(value) {
      dragging = value;
      guides();
    },
  };
  render();
})();
