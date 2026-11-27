'use strict';

let fonts = [];
let folder = null;
let folderTrail = [];
let highlighted = '';
const assetMime = 'application/x-vibevmix-asset';
let hoveredFont = null;
let fontRows = [];
let fontIndex = -1;
let fontMatches = [];
const fontGroups = new Map();
const fontBatch = 36;
const fontPopup = $('fontPopup');
const fontSearch = $('fontSearch');
const fontList = $('fontList');
const sameCaptionFont = new Option('沿用中文字体', '');
let editingLatinFont = false;
let latinFontValue = '';

function selectedCaptionFont(latin) {
  const select = $('font');
  return latin
    ? Array.from(select.options).find((option) => option.value === latinFontValue) ||
        sameCaptionFont
    : select.selectedOptions[0];
}

function fontFace(option) {
  if (!option.value) return fontFace(selectedCaptionFont(false));
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
  for (const latin of [false, true]) {
    const option = selectedCaptionFont(latin);
    if (!option) continue;
    const label = $(latin ? 'latinFontValue' : 'fontValue');
    label.textContent = option.text;
    label.style.fontFamily = fontFace(option);
  }
}

function highlightFont(index, scroll = false) {
  if (index >= fontRows.length) appendFontRows();
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
  $('fontSample').textContent = ($('programTitle').value.trim() || '舞台字幕') + ' Aa 123';
  if ($('captionTemplateDialog').open) updateCaptionEditorFont();
}

function appendFontRows() {
  const current = selectedCaptionFont(editingLatinFont).value;
  const end = Math.min(fontRows.length + fontBatch, fontMatches.length);
  for (let index = fontRows.length; index < end; index++) {
    const { group, option } = fontMatches[index];
    if (!fontGroups.has(group)) {
      const section = document.createElement('div');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', group);
      const label = document.createElement('span');
      label.className = 'font-group';
      label.textContent = group;
      section.append(label);
      fontGroups.set(group, section);
      fontList.append(section);
    }
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
    fontGroups.get(group).append(row);
  }
}

function renderFontList() {
  const query = fontSearch.value.trim().toLowerCase();
  const current = selectedCaptionFont(editingLatinFont).value;
  fontList.replaceChildren();
  fontList.scrollTop = 0;
  fontRows = [];
  fontIndex = -1;
  fontGroups.clear();
  const groups = new Map();
  const options = Array.from($('font').options);
  if (editingLatinFont) options.unshift(sameCaptionFont);
  for (const option of options) {
    if (!option.text.toLowerCase().includes(query)) continue;
    const group = option.dataset.file
      ? '导入字体'
      : ['', 'template', 'serif', 'sans-serif'].includes(option.value)
        ? '常用字体'
        : '本机字体';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
  }
  fontMatches = ['常用字体', '导入字体', '本机字体'].flatMap((group) =>
    (groups.get(group) || []).map((option) => ({ group, option })),
  );
  appendFontRows();
  if (!fontRows.length) fontList.textContent = '没有匹配的字体';
  highlightFont(
    Math.max(
      0,
      fontRows.findIndex((row) => row.option.value === current),
    ),
    true,
  );
}

fontList.onscroll = () => {
  if (fontList.scrollHeight - fontList.scrollTop - fontList.clientHeight < 140) appendFontRows();
};

function closeFontList(focus = false) {
  if (!fontPopup.matches(':popover-open')) return;
  fontPopup.hidePopover();
  const button = $(editingLatinFont ? 'latinFontPicker' : 'fontPicker');
  button.setAttribute('aria-expanded', 'false');
  hoveredFont = null;
  if ($('captionTemplateDialog').open) updateCaptionEditorFont();
  if (focus) button.focus();
}

function chooseFont(option) {
  if (editingLatinFont) latinFontValue = option.value;
  else $('font').value = option.value;
  updateFontLabel();
  closeFontList(true);
  $('font').dispatchEvent(new Event('input', { bubbles: true }));
}

function positionFontPopup() {
  if (!fontPopup.matches(':popover-open')) return;
  const rect = $(editingLatinFont ? 'latinFontPicker' : 'fontPicker').getBoundingClientRect();
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

function openFontList(latin) {
  if (fontPopup.matches(':popover-open')) {
    closeFontList();
    if (editingLatinFont === latin) return;
  }
  editingLatinFont = latin;
  fontSearch.value = '';
  fontPopup.showPopover();
  $(latin ? 'latinFontPicker' : 'fontPicker').setAttribute('aria-expanded', 'true');
  positionFontPopup();
  renderFontList();
  fontSearch.focus({ preventScroll: true });
}
$('fontPicker').onclick = () => openFontList(false);
$('latinFontPicker').onclick = () => openFontList(true);
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
  if (!fontPopup.contains(event.target) && !event.target.closest('#fontPicker, #latinFontPicker'))
    closeFontList();
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

function renderFonts(value, latin = latinFontValue) {
  const select = $('font');
  const imported = assets.filter((entry) => entry.kind === 'font' && entry.available);
  const signature = JSON.stringify([
    fonts,
    imported.map((asset) => [asset.file, asset.name]),
    value,
    latin,
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
  for (const choice of new Set([value, latin].filter(Boolean))) {
    if (Array.from(select.options).some((option) => option.value === choice)) continue;
    const option = new Option(choice, choice);
    if (/^[a-f0-9]{32}\.(ttf|otf|woff2?)$/.test(choice)) option.dataset.file = choice;
    select.add(option);
  }
  select.value = value || 'template';
  latinFontValue = latin;
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
  renderFonts($('font').value);
  renderLibrary();
  $('captionTemplateStatus').textContent = '字体已导入，可在中文或英文与数字字体菜单中选用。';
});

function applyFont(asset) {
  if (!assets.some((entry) => entry.id === asset.id)) assets.push({ ...asset, available: true });
  renderFonts(asset.file);
  $('font').dispatchEvent(new Event('input', { bubbles: true }));
}

const alphaPreviews = new WeakMap();
function replaceAssetPreview(container, ...children) {
  for (const child of container.children) alphaPreviews.get(child)?.stop();
  container.replaceChildren(...children);
}
function media(asset, full = false, playAlpha = false) {
  if (!asset?.available) return null;
  if (StageMedia.isSequence(asset.file)) {
    if (!playAlpha) return null;
    const holder = document.createElement('span');
    holder.className = 'alpha-asset-preview';
    const preview = StageMedia.mount(holder);
    alphaPreviews.set(holder, preview);
    preview.set(asset.file, {
      loop: true,
      error: (message) => {
        holder.textContent = message;
      },
    });
    return holder;
  }
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
  replaceAssetPreview(detail);
  if (!item) return;
  const title = document.createElement('strong');
  title.textContent = item.name;
  const preview = media(item, true, true);
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
  if (select.id !== 'captionTemplateBackground') {
    const preview = document.createElement('span');
    preview.className = 'asset-field-preview';
    preview.hidden = true;
    select.after(preview);
  }
  select.onchange = () => renderAssetTarget(select);
  setupDrop(select.parentElement, async (item) => {
    if (!canBindAsset(item, select.dataset.assets)) throw Error('素材类型与此栏不匹配');
    setAssetOption(select, (await pinAsset(item)).file);
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

const previewFrame = document.createElement('iframe');
previewFrame.setAttribute('allowtransparency', 'true');
const previewWrap = $('previewWrap');
function syncPreviewBackground(background) {
  if (background === undefined) {
    try {
      background = JSON.parse(
        localStorage.getItem('broadcast-preview-tools-v1') || '{}',
      ).background;
    } catch (_) {}
  }
  previewWrap.dataset.background = ['checker', 'pitch', 'dark', 'light'].includes(background)
    ? background
    : 'checker';
}
syncPreviewBackground();
window.addEventListener('storage', (event) => {
  if (event.key === 'broadcast-preview-tools-v1' || event.key === null) syncPreviewBackground();
});
if (window.parent !== window && document.referrer) {
  const workspaceOrigin = new URL(document.referrer).origin;
  window.addEventListener('message', (event) => {
    if (
      event.source === window.parent &&
      event.origin === workspaceOrigin &&
      event.data?.type === 'preview-background'
    )
      syncPreviewBackground(event.data.background);
  });
  window.parent.postMessage({ type: 'preview-background' }, workspaceOrigin);
}
new ResizeObserver(() => {
  const width = previewWrap.getBoundingClientRect().width;
  if (width) previewFrame.style.zoom = width / 1920;
}).observe(previewWrap);
const previewLayer = $('dockPreviewLayer');
const awardPreviewURL = '/stage/award.html?workspacePreview=1';
let previewFrameURL = '';
let awardPreviewReady = false;
let graphicsPreviewLayer = previewLayer.value;
let dockAwardStill = null;
let dockAwardPlayback = null;
previewLayer.onchange = () => {
  if (previewLayer.value === '' || previewLayer.value === 'caption')
    graphicsPreviewLayer = previewLayer.value;
  syncDockPreview();
};

function postDockAwardPreview(type, cue) {
  if (!awardPreviewReady || previewFrameURL !== awardPreviewURL) return;
  previewFrame.contentWindow.postMessage({ type, cue }, location.origin);
}

function updateDockAwardPreview(cue) {
  if (JSON.stringify(dockAwardStill) === JSON.stringify(cue)) return;
  dockAwardStill = cue;
  if (!dockAwardPlayback) postDockAwardPreview('award-still', cue);
}

function playReadyDockAwardPreview() {
  if (!awardPreviewReady || !dockAwardPlayback || dockAwardPlayback.startedAt) return;
  const startedAt = Date.now();
  dockAwardPlayback.startedAt = startedAt;
  postDockAwardPreview('award-preview', { ...dockAwardPlayback.cue, startedAt, exitAt: 0 });
  syncAwardEditor();
}

function playDockAwardPreview(cue) {
  dockAwardPlayback = { cue, startedAt: 0 };
  usePackagingSidePreview('award');
  playReadyDockAwardPreview();
  syncAwardEditor();
}

function stopDockAwardPreview() {
  if (!dockAwardPlayback) return;
  dockAwardPlayback = null;
  postDockAwardPreview('award-preview', null);
  syncAwardEditor();
}

function usePackagingSidePreview(mode) {
  previewLayer.value = mode || graphicsPreviewLayer;
  syncDockPreview();
}

window.addEventListener('message', (event) => {
  if (
    previewFrameURL !== awardPreviewURL ||
    event.origin !== location.origin ||
    event.source !== previewFrame.contentWindow
  )
    return;
  if (event.data?.type === 'award-preview-ready') {
    awardPreviewReady = true;
    if (dockAwardPlayback) playReadyDockAwardPreview();
    else postDockAwardPreview('award-still', dockAwardStill);
  }
  if (
    event.data?.type === 'award-preview-ended' &&
    dockAwardPlayback?.startedAt === event.data.startedAt
  )
    stopDockAwardPreview();
});

function syncDockPreview(templateId = '', captionTemplateId) {
  if (settingsView) return;
  const layer = previewLayer.value;
  let url = '/stage/graphics.html?workspacePreview=1';
  let title = '舞台排版预览';
  if (layer === 'award') {
    url = awardPreviewURL;
    title = '颁奖预览';
  } else if (layer === 'promotion') {
    const query = new URLSearchParams({ workspacePreview: '1', round: promotionRound ?? '' });
    url = '/stage/promotion.html?' + query;
    title = '晋级名单预览';
  }
  if (previewFrameURL !== url) {
    if (layer !== 'award') stopDockAwardPreview();
    awardPreviewReady = false;
    previewFrameURL = url;
    previewFrame.title = title;
    previewFrame.src = url;
    if (!previewFrame.isConnected) previewWrap.append(previewFrame);
  }
  if (layer === 'award' || layer === 'promotion') return;
  const branding = {};
  for (const key of ['channelAsset', 'eventAsset']) branding[key] = $(key).value;
  const item = state?.programs.find((entry) => entry.id === selected);
  const program = item && {
    ...item,
    type: $('programType').value,
    title: $('programTitle').value,
    performer: $('programPerformer').value,
    subtitle: $('programSubtitle').value,
    caption: $('programCaption').value,
    captionTemplateId: $('programCaptionTemplate').value,
  };
  previewFrame.contentWindow.postMessage(
    {
      type: 'preview-layout',
      module: 'stage',
      branding,
      program,
      templateId,
      captionTemplateId,
      presentation: {
        mode: 'layout',
        only: templateId || captionTemplateId !== undefined ? 'caption' : previewLayer.value,
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
syncDockPreview();
