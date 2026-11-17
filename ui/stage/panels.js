'use strict';

let fonts = [];
let folder = null;
let folderTrail = [];
let highlighted = '';
const assetMime = 'application/x-vibevmix-asset';
let hoveredFont = null;
let fontRows = [];
let fontIndex = -1;
const fontPopup = $('fontPopup');
const fontSearch = $('fontSearch');
const fontList = $('fontList');

function fontFace(option) {
  if (option.dataset.file) {
    const file = option.dataset.file;
    if (!/^[a-f0-9]{32}\.(ttf|otf|woff2?)$/.test(file)) return '';
    const family = 'StageMenu-' + file.split('.')[0];
    if (!document.getElementById(family)) {
      const rule = document.createElement('style');
      rule.id = family;
      rule.textContent =
        '@font-face{font-family:' + family + ';src:url("/assets/' + file + '");font-display:swap}';
      document.head.append(rule);
    }
    return family + ', sans-serif';
  }
  const name =
    option.value === 'template'
      ? templates.find((item) => item.id === state?.templateId)?.font || 'sans-serif'
      : option.value;
  return ['serif', 'sans-serif'].includes(name) ? name : JSON.stringify(name) + ', sans-serif';
}

function updateFontLabel() {
  const option = $('font').selectedOptions[0];
  if (!option) return;
  $('fontValue').textContent = option.text;
  $('fontValue').style.fontFamily = fontFace(option);
}

function highlightFont(index, scroll = false) {
  fontRows[fontIndex]?.removeAttribute('data-active');
  const row = fontRows[Math.max(0, Math.min(index, fontRows.length - 1))];
  if (row) {
    fontIndex = fontRows.indexOf(row);
    row.dataset.active = 'true';
    fontSearch.setAttribute('aria-activedescendant', row.id);
    if (scroll) row.scrollIntoView({ block: 'nearest' });
  } else {
    fontIndex = -1;
    fontSearch.removeAttribute('aria-activedescendant');
  }
  hoveredFont = row?.option || null;
  $('fontSample').style.fontFamily = row?.style.fontFamily || '';
  $('fontSample').textContent = $('programTitle').value.trim() || '舞台字幕 Aa 123';
  syncDockPreview();
}

function renderFontList() {
  const query = fontSearch.value.trim().toLowerCase();
  const current = $('font').value;
  fontList.replaceChildren();
  fontRows = [];
  fontIndex = -1;
  const groups = new Map();
  for (const option of $('font').options) {
    if (!option.text.toLowerCase().includes(query)) continue;
    const group = option.dataset.file
      ? '导入字体'
      : ['template', 'serif', 'sans-serif'].includes(option.value)
        ? '常用字体'
        : '本机字体';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
  }
  for (const [group, options] of groups) {
    const section = document.createElement('div');
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', group);
    const label = document.createElement('span');
    label.className = 'font-group';
    label.textContent = group;
    section.append(label);
    for (const option of options) {
      const index = fontRows.length;
      const row = document.createElement('div');
      row.id = 'font-option-' + index;
      row.className = 'font-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(current === option.value));
      row.textContent = option.text;
      row.style.fontFamily = fontFace(option);
      row.option = option;
      row.onpointerenter = (event) => {
        if (event.pointerType !== 'touch') highlightFont(index);
      };
      row.onpointerdown = (event) => event.preventDefault();
      row.onclick = () => chooseFont(option);
      fontRows.push(row);
      section.append(row);
    }
    fontList.append(section);
  }
  if (!fontRows.length) fontList.textContent = '没有匹配的字体';
  highlightFont(
    Math.max(
      0,
      fontRows.findIndex((row) => row.option.value === current),
    ),
    true,
  );
}

function closeFontList(focus = false) {
  if (!fontPopup.matches(':popover-open')) return;
  fontPopup.hidePopover();
  $('fontPicker').setAttribute('aria-expanded', 'false');
  hoveredFont = null;
  syncDockPreview();
  if (focus) $('fontPicker').focus();
}

function chooseFont(option) {
  $('font').value = option.value;
  updateFontLabel();
  closeFontList(true);
  $('font').dispatchEvent(new Event('input', { bubbles: true }));
}

function positionFontPopup() {
  if (!fontPopup.matches(':popover-open')) return;
  const rect = $('fontPicker').getBoundingClientRect();
  const width = Math.min(Math.max(240, rect.width), innerWidth - 16);
  const below = innerHeight - rect.bottom - 10;
  const above = rect.top - 10;
  fontPopup.style.width = width + 'px';
  fontPopup.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
  fontPopup.style.maxHeight = Math.max(88, Math.min(430, Math.max(below, above))) + 'px';
  fontPopup.style.top = below >= Math.min(270, above) ? rect.bottom + 4 + 'px' : 'auto';
  fontPopup.style.bottom =
    fontPopup.style.top === 'auto' ? innerHeight - rect.top + 4 + 'px' : 'auto';
}

$('fontPicker').onclick = () => {
  if (fontPopup.matches(':popover-open')) return closeFontList();
  fontSearch.value = '';
  fontPopup.showPopover();
  $('fontPicker').setAttribute('aria-expanded', 'true');
  positionFontPopup();
  renderFontList();
  fontSearch.focus({ preventScroll: true });
};
fontSearch.oninput = (event) => {
  event.stopPropagation();
  renderFontList();
};
fontSearch.onkeydown = (event) => {
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
  if (Object.hasOwn(steps, event.key)) {
    event.preventDefault();
    highlightFont(fontIndex + steps[event.key], true);
  } else if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault();
    if (event.key === 'Enter' && hoveredFont) chooseFont(hoveredFont);
    else closeFontList(true);
  } else if (event.key === 'Tab') closeFontList(true);
};
document.addEventListener('pointerdown', (event) => {
  if (!fontPopup.contains(event.target) && !$('fontPicker').contains(event.target)) closeFontList();
});
window.addEventListener('resize', positionFontPopup);
document.addEventListener(
  'scroll',
  (event) => {
    if (event.target !== fontList) positionFontPopup();
  },
  true,
);

function syncPalette() {
  const template = templates.find((entry) => entry.id === state?.templateId) || templates[0];
  document.querySelectorAll('[data-color-for]').forEach((picker) => {
    const key = picker.dataset.colorFor;
    picker.value =
      (/^#[0-9a-f]{6}$/i.test($(key).value) ? $(key).value : template?.[key]) || '#000000';
  });
}

function renderFonts(value) {
  const select = $('font');
  const imported = assets.filter((entry) => entry.kind === 'font' && entry.available);
  const signature = JSON.stringify([
    fonts,
    imported.map((asset) => [asset.file, asset.name]),
    value,
  ]);
  if (select.dataset.signature === signature && select.value === value) {
    updateFontLabel();
    return;
  }
  select.dataset.signature = signature;
  const defaults = [
    ['template', '沿用模板'],
    ['sans-serif', '黑体'],
    ['serif', '宋体'],
  ];
  select.replaceChildren(...defaults.map(([id, name]) => new Option(name, id)));
  for (const name of fonts) select.add(new Option(name, name));
  for (const asset of imported) {
    const option = new Option(asset.name.replace(/\.[^.]+$/, '') + ' · 导入', asset.file);
    option.dataset.file = asset.file;
    select.add(option);
  }
  if (value && !Array.from(select.options).some((option) => option.value === value)) {
    const option = new Option(value, value);
    if (/^[a-f0-9]{32}\.(ttf|otf|woff2?)$/.test(value)) option.dataset.file = value;
    select.add(option);
  }
  select.value = value || 'template';
  updateFontLabel();
  if (fontPopup.matches(':popover-open')) renderFontList();
}

function setInstalledFonts(values) {
  fonts = [...new Set(values.filter((name) => typeof name === 'string' && name.length <= 120))];
  renderFonts($('font').value);
}

$('fontImport').onchange = run(async () => {
  const file = $('fontImport').files[0];
  $('fontImport').value = '';
  if (!file) return;
  if (file.size > 24 * 1024 * 1024) throw Error('字体文件上限为 24 MB');
  const asset = await uploadAsset(file);
  assets.push({ ...asset, available: true });
  applyFont(asset);
  renderLibrary();
});

function applyFont(asset) {
  if (!assets.some((entry) => entry.id === asset.id)) assets.push({ ...asset, available: true });
  renderFonts(asset.file);
  $('font').dispatchEvent(new Event('input', { bubbles: true }));
}

function media(asset, full = false) {
  if (!asset?.available) return null;
  const image = asset.kind === 'image';
  if (!image && !['.webm', '.mp4', '.mov'].some((extension) => asset.file.endsWith(extension)))
    return null;
  const node = document.createElement(image ? 'img' : 'video');
  node.src = '/assets/' + encodeURIComponent(asset.file);
  if (image) {
    node.alt = '';
    node.loading = 'lazy';
  } else {
    node.preload = full ? 'metadata' : 'none';
    node.controls = full;
    node.muted = true;
    node.playsInline = true;
  }
  return node;
}

function previewAsset(item) {
  const detail = $('assetDetails');
  detail.replaceChildren();
  if (!item) return;
  const title = document.createElement('strong');
  title.textContent = item.name;
  const preview = media(item, true);
  detail.append(title);
  if (preview) detail.append(preview);
  const actions = assetActions(item);
  if (folder && !assets.some((entry) => entry.sourcePath === item.sourcePath)) {
    const link = document.createElement('button');
    link.textContent = '收藏原文件';
    link.onclick = run(async () => {
      await pinAsset(item);
      previewAsset(item);
    });
    actions.prepend(link);
  }
  if (item.kind === 'font' && item.available) {
    const use = document.createElement('button');
    use.textContent = '使用字体';
    use.onclick = run(async () => applyFont(await pinAsset(item)));
    actions.append(use);
  }
  detail.append(actions);
}

function renderLibrary() {
  const category = $('assetKind').value;
  const search = $('assetSearch').value.trim().toLowerCase();
  const items = (folder?.assets || assets).filter(
    (item) => item.kind === category && item.name.toLowerCase().includes(search),
  );
  const list = $('assetList');
  list.replaceChildren();
  const selected = items.find((item) => item.id === highlighted);
  $('renderSection').hidden = category !== 'ae';
  $('folderNav').hidden = !folder;
  $('folderBack').disabled = folderTrail.length < 2;
  $('folderName').textContent = folder?.name || '';
  $('assetFolders').replaceChildren(
    ...(folder?.folders || []).map((child) => {
      const button = document.createElement('button');
      button.textContent = child.name;
      button.onclick = run(() => browseFolder({ folder: child.id }));
      return button;
    }),
  );
  for (const item of items) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'asset-tile';
    tile.draggable = item.available;
    tile.setAttribute('aria-pressed', String(item === selected));
    const thumbnail = document.createElement('span');
    thumbnail.className = 'asset-thumb';
    const picture = item.kind === 'image' ? media(item) : null;
    thumbnail.append(picture || item.file.split('.').at(-1).toUpperCase());
    const title = document.createElement('span');
    title.textContent = item.name;
    tile.title = item.name;
    tile.append(thumbnail, title);
    tile.onclick = () => {
      highlighted = item.id;
      list
        .querySelectorAll('button')
        .forEach((entry) => entry.setAttribute('aria-pressed', String(entry === tile)));
      previewAsset(item);
    };
    tile.ondragstart = (event) => {
      event.dataTransfer.setData(assetMime, item.id);
      event.dataTransfer.effectAllowed = 'link';
    };
    list.append(tile);
  }
  if (!items.length) list.textContent = '此分类暂无素材';
  previewAsset(selected);
}

async function pinAsset(item) {
  const existing = assets.find(
    (entry) => entry.id === item.id || (item.sourcePath && entry.sourcePath === item.sourcePath),
  );
  if (existing) return existing;
  const { asset } = await api('/api/stage/asset-link', { id: item.id });
  const linked = { ...asset, available: true };
  assets.push(linked);
  assetOptions();
  return linked;
}

async function browseFolder(payload, index) {
  const next = await api('/api/stage/folder', payload);
  if (!payload.folder) folderTrail = ['root'];
  else if (index === undefined) folderTrail.push(payload.folder);
  else folderTrail = folderTrail.slice(0, index + 1);
  folder = next;
  highlighted = '';
  renderLibrary();
}

$('assetKind').onchange = $('assetSearch').oninput = renderLibrary;
$('openFolder').onclick = run(() => {
  if (window.parent === window) throw Error('请在桌面工作台中打开文件夹');
  window.parent.postMessage({ type: 'open-folder' }, '*');
});
$('folderBack').onclick = run(() =>
  browseFolder({ folder: folderTrail.at(-2) }, folderTrail.length - 2),
);
$('savedAssets').onclick = () => {
  folder = null;
  renderLibrary();
};

function renderAssetTarget(select) {
  const destination = select.parentElement.querySelector('.asset-field-preview');
  const item = assets.find((entry) => entry.file === select.value);
  if (destination && destination.dataset.asset !== (item?.available ? item.file : '')) {
    destination.dataset.asset = item?.available ? item.file : '';
    const preview = media(item, item?.kind === 'video');
    destination.replaceChildren(...(preview ? [preview] : []));
    destination.hidden = !preview;
  }
}

function setupDrop(field, apply) {
  field.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes(assetMime)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'link';
    field.classList.add('asset-drop');
  });
  field.addEventListener('dragleave', () => field.classList.remove('asset-drop'));
  field.addEventListener(
    'drop',
    run(async (event) => {
      field.classList.remove('asset-drop');
      const id = event.dataTransfer.getData(assetMime);
      if (!id) return;
      const item = [...assets, ...(folder?.assets || [])].find((entry) => entry.id === id);
      if (!item) throw Error('素材已移动');
      await apply(item);
    }),
  );
}

document.querySelectorAll('[data-assets]').forEach((select) => {
  const preview = document.createElement('span');
  preview.className = 'asset-field-preview';
  preview.hidden = true;
  select.after(preview);
  select.onchange = () => renderAssetTarget(select);
  setupDrop(select.parentElement, async (item) => {
    if (
      item.kind !== select.dataset.assets ||
      (item.kind === 'video' && !/\.(webm|mp4)$/i.test(item.file))
    )
      throw Error('素材类型与此栏不匹配');
    select.value = (await pinAsset(item)).file;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    renderAssetTarget(select);
  });
});
setupDrop($('renderSource').parentElement, async (item) => {
  if (item.kind !== 'ae') throw Error('请拖入 AE 工程');
  $('renderSource').value = (await pinAsset(item)).id;
});
setupDrop($('font').parentElement, async (item) => {
  if (item.kind !== 'font') throw Error('请拖入字体文件');
  applyFont(await pinAsset(item));
});

const panelDefaults = { library: 'left', preview: 'center', design: 'hidden' };
let panelLocations = { ...panelDefaults };
let dockWidth = 286;
try {
  const saved = JSON.parse(localStorage.getItem('stage-dock') || '{}');
  for (const id of Object.keys(panelDefaults))
    if (['left', 'right', 'center', 'bottom', 'hidden'].includes(saved[id]))
      panelLocations[id] = saved[id];
  if (Number.isFinite(saved.width)) dockWidth = Math.max(220, Math.min(saved.width, 460));
} catch {}

const panels = {
  library: { element: $('library'), name: '素材库' },
  preview: { element: $('dockedPreview'), name: '预览' },
  design: { element: $('design'), name: '包装属性' },
};
function showDesignPanel() {
  if (panelLocations.design === 'hidden') {
    panelLocations.design = panels.design.position.value;
    commitPanels();
  }
}
let draggedPanel = '';
let previewLayer = 'lower';
const layer = document.createElement('select');
layer.setAttribute('aria-label', '预览图层');
for (const [value, label] of [
  ['lower', '节目字幕'],
  ['caption', '歌词字幕'],
  ['', '全部图层'],
])
  layer.add(new Option(label, value));
layer.onchange = () => {
  previewLayer = layer.value;
  syncDockPreview();
};
const previewFrame = document.createElement('iframe');
previewFrame.title = '舞台排版预览';
const previewWrap = $('previewWrap');
const resizePreview = () => {
  previewFrame.style.transform = 'scale(' + previewWrap.clientWidth / 1920 + ')';
};
new ResizeObserver(resizePreview).observe(previewWrap);
const slots = {
  left: $('dockLeft'),
  center: $('dockCenter'),
  right: $('dockRight'),
  bottom: $('dockBottom'),
};
panels.preview.element.querySelector('.panel-actions').append(layer);

function arrangePanels() {
  $('stageWorkspace').style.setProperty('--dock-width', dockWidth + 'px');
  Object.entries(panels).forEach(([id, panel]) => {
    const position = panelLocations[id];
    panel.element.hidden = position === 'hidden';
    const slot = slots[position];
    if (slot && panel.element.parentElement !== slot) {
      if (position === 'center') slot.prepend(panel.element);
      else slot.append(panel.element);
    }
    panel.menu.setAttribute('aria-pressed', String(!panel.element.hidden));
  });
  for (const side of ['left', 'right', 'bottom'])
    slots[side].hidden = !Object.values(panelLocations).includes(side);
  $('dockDivider').hidden = slots.left.hidden;
  if (!panels.preview.element.hidden && !previewFrame.isConnected) {
    previewFrame.src = '/stage/graphics.html?workspacePreview=1';
    previewWrap.append(previewFrame);
  } else if (panels.preview.element.hidden) previewFrame.remove();
}

function commitPanels() {
  arrangePanels();
  try {
    localStorage.setItem('stage-dock', JSON.stringify({ ...panelLocations, width: dockWidth }));
  } catch {}
}

for (const [id, panel] of Object.entries(panels)) {
  const bar = panel.element.querySelector('.panel-bar');
  const actions = bar.querySelector('.panel-actions');
  const position = document.createElement('select');
  position.setAttribute('aria-label', panel.name + '停靠位置');
  ['left', 'center', 'right', 'bottom'].forEach((side, i) =>
    position.add(new Option(['左侧', '中间', '右侧', '底部'][i], side)),
  );
  position.value =
    panelLocations[id] === 'hidden'
      ? id === 'design'
        ? 'right'
        : panelDefaults[id]
      : panelLocations[id];
  position.onchange = () => {
    panelLocations[id] = position.value;
    commitPanels();
  };
  panel.position = position;
  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭' + panel.name);
  close.onclick = () => {
    panelLocations[id] = 'hidden';
    commitPanels();
  };
  actions.append(position, close);
  const menu = document.createElement('button');
  menu.textContent = panel.name;
  menu.onclick = () => {
    panelLocations[id] = panel.element.hidden ? position.value : 'hidden';
    commitPanels();
  };
  panel.menu = menu;
  $('panelMenu').append(menu);
  bar.ondragstart = (event) => {
    if (event.target !== bar) return;
    draggedPanel = id;
    event.dataTransfer.setData('application/x-vibevmix-panel', id);
    $('stageWorkspace').classList.add('panel-dragging');
    for (const side of ['left', 'right', 'bottom']) slots[side].hidden = false;
  };
  bar.ondragend = () => {
    draggedPanel = '';
    $('stageWorkspace').classList.remove('panel-dragging');
    arrangePanels();
  };
}
for (const [side, slot] of Object.entries(slots)) {
  slot.addEventListener('dragover', (event) => {
    if (draggedPanel) event.preventDefault();
  });
  slot.addEventListener('drop', (event) => {
    if (!draggedPanel) return;
    event.preventDefault();
    event.stopPropagation();
    panelLocations[draggedPanel] = side;
    panels[draggedPanel].position.value = side;
    commitPanels();
  });
}
const resetDock = document.createElement('button');
resetDock.textContent = '恢复默认布局';
resetDock.onclick = () => {
  panelLocations = { ...panelDefaults };
  dockWidth = 286;
  Object.entries(panels).forEach(([id, panel]) => {
    panel.position.value = id === 'design' ? 'right' : panelDefaults[id];
  });
  commitPanels();
};
$('panelMenu').append(resetDock);

const divider = $('dockDivider');
divider.onpointerdown = (event) => {
  const width = dockWidth;
  const start = event.clientX;
  divider.setPointerCapture(event.pointerId);
  divider.onpointermove = (move) => {
    dockWidth = Math.max(220, Math.min(460, width + move.clientX - start));
    $('stageWorkspace').style.setProperty('--dock-width', dockWidth + 'px');
  };
};
divider.onlostpointercapture = () => {
  divider.onpointermove = null;
  commitPanels();
};
divider.onkeydown = (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  dockWidth = Math.max(220, Math.min(460, dockWidth + (event.key === 'ArrowLeft' ? -12 : 12)));
  commitPanels();
};

function syncDockPreview(templateId = '') {
  if (!previewFrame.isConnected) return;
  const layout = {};
  for (const key of ['accent', 'background', 'foreground'])
    layout[key] = templateId ? '' : $(key).value;
  const font = hoveredFont || $('font').selectedOptions[0];
  layout.font = templateId || font?.dataset.file ? 'template' : font?.value || 'template';
  layout.fontAsset = templateId ? '' : font?.dataset.file || '';
  layout.fontSize = Number($('fontSize').value) || 48;
  const branding = {};
  for (const key of [
    'channelAsset',
    'eventAsset',
    'sponsorAsset',
    'channelName',
    'eventName',
    'sponsorName',
  ])
    branding[key] = $(key).value;
  const item = state?.programs.find((entry) => entry.id === selected);
  const program = item && {
    ...item,
    type: $('programType').value,
    title: $('programTitle').value,
    performer: $('programPerformer').value,
    subtitle: $('programSubtitle').value,
    caption: $('programCaption').value,
  };
  previewFrame.contentWindow.postMessage(
    {
      type: 'preview-layout',
      module: 'stage',
      layout,
      branding,
      program,
      templateId,
      presentation: {
        mode: 'layout',
        only: templateId === 'lyrics' ? 'caption' : previewLayer,
        hidden: [],
      },
    },
    location.origin,
  );
}
previewFrame.onload = () => {
  if (state) syncDockPreview();
};
$('designForm').addEventListener('input', () => syncDockPreview());
$('programForm').addEventListener('input', () => syncDockPreview());
arrangePanels();
