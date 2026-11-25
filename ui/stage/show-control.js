'use strict';

let roundView = '';
let captionTemplateDraft = '';
let captionTemplatePreset = '';
let captionOriginalName = '';
let captionEditAnchor;
let captionCardsSignature = '';
let captionPreviewFrame;
let captionPreview;
let captionLineMotion;
let captionPreviewEffect;
let captionPreviewReset;

function roundOptions() {
  return [['', '未分轮'], ...state.rounds.map(({ id, name }) => [id, name])];
}

function showRound(roundId) {
  roundView = roundId;
  selected = state.programs.find((entry) => entry.roundId === roundId)?.id || '';
  renderState();
}

function syncShowControls() {
  if (roundView && !state.rounds.some(({ id }) => id === roundView)) roundView = '';
  const options = roundOptions();
  replaceOptions($('roundView'), options);
  $('roundView').value = roundView;
  replaceOptions($('programRound'), options);
  replaceOptions($('programCaptionTemplate'), [
    ['', '沿用活动默认'],
    ...state.captionTemplates.map(({ id, name }) => [id, name]),
  ]);
  $('renameRound').disabled = !roundView;
  $('deleteRound').disabled =
    !roundView ||
    state.programs.some((item) => item.roundId === roundView) ||
    state.promotions.some((item) => item.id === roundView);
  $('replayAnnouncement').disabled = !state.live?.announcementAsset;
  renderCaptionTemplateCards();
}

const captionBoxes = { backgroundBox: '背景', textBox: '字幕文本框' };
const geometryFields = { x: 'X', y: 'Y', width: '宽度', height: '高度' };
const captionEffectOptions = [
  ['cut', '直切'],
  ['mix', 'Mix · 淡入淡出'],
  ['wipe-left-to-right', 'Wipe · 从左到右'],
  ['wipe-right-to-left', 'Wipe · 从右到左'],
];

function templateBox(key) {
  return Object.fromEntries(
    Object.keys(geometryFields).map((field) => [field, Number($(key + field).value)]),
  );
}

function updateCaptionEditor(keepFrame = false) {
  const frame = $('captionTemplatePreview');
  const background = $('captionTemplateBackground').value;
  const textBox = templateBox('textBox');
  const backgroundBox = templateBox('backgroundBox');
  const visualBounds = StageCaptions.bounds({ background: true, textBox, backgroundBox });
  if (!keepFrame || !captionPreviewFrame) {
    const width = frame.clientWidth || 540,
      height = frame.clientHeight || 270;
    const scale = Math.max(
      0.001,
      Math.min(
        1,
        (width - 40) / Math.max(1, visualBounds.width),
        (height - 36) / Math.max(1, visualBounds.height),
      ),
    );
    captionPreviewFrame = {
      scale,
      x: (width - visualBounds.width * scale) / 2 - visualBounds.x * scale,
      y: (height - visualBounds.height * scale) / 2 - visualBounds.y * scale,
    };
  }
  const view = captionPreviewFrame;
  for (const [id, box] of [
    ['captionPreviewBackground', backgroundBox],
    ['captionPreviewText', textBox],
  ]) {
    const node = $(id);
    Object.assign(node.style, {
      left: view.x + box.x * view.scale + 'px',
      top: view.y + box.y * view.scale + 'px',
      width: Math.max(1, box.width * view.scale) + 'px',
      height: Math.max(1, box.height * view.scale) + 'px',
    });
  }
  const appearance = readCaptionAppearance();
  const text = $('captionPreviewText');
  text.style.fontSize = appearance.fontSize * view.scale + 'px';
  text.style.color = appearance.foreground;
  text.style.backgroundColor = !background ? appearance.background : '';
  text.style.borderColor = appearance.accent;
  updateCaptionEditorFont();
  $('captionPreviewBackground').classList.toggle('without-media', !background);
  const geometry = {
    backgroundFit: $('captionTemplateFit').value,
    canvasAnchor: captionEditAnchor,
    backgroundBox,
  };
  const footage = $('captionPreviewFootage');
  const place = (size) => {
    const box = StageCaptions.backgroundPlacement(geometry, size);
    footage.style.left = (box.x - backgroundBox.x) * view.scale + 'px';
    footage.style.top = (box.y - backgroundBox.y) * view.scale + 'px';
    footage.style.width = box.width * view.scale + 'px';
    footage.style.height = box.height * view.scale + 'px';
  };
  captionPreview.set($('captionTemplateDialog').open ? background : '', {
    onDimensions: place,
    error: (message) => {
      $('captionTemplateStatus').textContent = '背景预览：' + message;
    },
  });
  place(captionPreview.size());
}

function updateCaptionEditorFont() {
  const primary = hoveredFont && !editingLatinFont ? hoveredFont : selectedCaptionFont(false);
  const latin = hoveredFont && editingLatinFont ? hoveredFont : selectedCaptionFont(true);
  const preview = $('captionPreviewText');
  if (primary) preview.style.fontFamily = fontFace(primary);
  preview.style.setProperty('--font-latin', latin.value ? fontFace(latin) : 'inherit');
}

function readCaptionAppearance() {
  const font = selectedCaptionFont(false);
  const latin = selectedCaptionFont(true);
  return {
    ...Object.fromEntries(['accent', 'background', 'foreground'].map((key) => [key, $(key).value])),
    font: font.dataset.file ? 'template' : font.value,
    fontAsset: font.dataset.file || '',
    latinFont: latin.dataset.file ? '' : latin.value,
    latinFontAsset: latin.dataset.file || '',
    fontSize: Number($('fontSize').value),
    motion: captionLineMotion,
    transition: {
      enter: $('captionEnterEffect').value,
      exit: $('captionExitEffect').value,
      enterDuration: $('captionEnterDuration').valueAsNumber,
      exitDuration: $('captionExitDuration').valueAsNumber,
    },
  };
}

function resetCaptionPreviewEffect() {
  clearTimeout(captionPreviewReset);
  captionPreviewEffect?.cancel();
  captionPreviewEffect = null;
  $('captionPreviewLayer').style.visibility = '';
}

function previewCaptionEffect(entering) {
  const phase = entering ? 'Enter' : 'Exit';
  if (!$('caption' + phase + 'Duration').reportValidity()) return;
  resetCaptionPreviewEffect();
  const { transition } = readCaptionAppearance();
  const layer = $('captionPreviewLayer');
  const effect = entering ? transition.enter : transition.exit;
  const duration = entering ? transition.enterDuration : transition.exitDuration;
  captionPreviewEffect = StageCaptions.animateTransition(layer, effect, entering, duration);
  if (!captionPreviewEffect && !entering) layer.style.visibility = 'hidden';
  captionPreviewReset = setTimeout(
    resetCaptionPreviewEffect,
    (captionPreviewEffect ? duration : 0) + (entering ? 0 : 400),
  );
}

function openCaptionEditor(item, preset) {
  captionTemplateDraft = item?.id || '';
  captionTemplatePreset = preset?.id || '';
  captionOriginalName = item?.name || preset?.name || '';
  $('captionTemplateDialogTitle').textContent = item || preset ? '编辑字幕模板' : '创建新模板';
  $('captionTemplateName').value = captionOriginalName;
  $('saveCaptionCopy').hidden = !item && !preset;
  $('captionTemplateDefault').checked = item
    ? state.captionTemplateId === item.id
    : preset
      ? !state.captionTemplateId && state.templateId === preset.id
      : state.captionTemplates.length === 0;
  $('captionTemplateDelete').hidden = !item;
  $('captionTemplateStatus').textContent = '';
  setAssetOption($('captionTemplateBackground'), item?.background || '');
  $('captionTemplateFit').value = item?.backgroundFit || 'auto';
  captionEditAnchor = item?.canvasAnchor ||
    item?.position || { x: state.style.captionX, y: state.style.captionY };
  const style = item?.appearance || { ...state.style, ...preset, fontSize: 38 };
  for (const key of ['accent', 'background', 'foreground']) $(key).value = style[key];
  $('fontSize').value = style.fontSize;
  captionLineMotion = style.motion;
  const effects = StageCaptions.captionTransition(style);
  $('captionEnterEffect').value = effects.enter;
  $('captionExitEffect').value = effects.exit;
  $('captionEnterDuration').value = effects.enterDuration;
  $('captionExitDuration').value = effects.exitDuration;
  renderFonts(style.fontAsset || style.font, style.latinFontAsset || style.latinFont || '');
  syncPalette();
  const boxes = {
    backgroundBox: item?.backgroundBox || { x: 0, y: 0, width: 920, height: 108 },
    textBox: item?.textBox || { x: 24, y: 22, width: 872, height: 64 },
  };
  for (const [key, box] of Object.entries(boxes))
    for (const [field, value] of Object.entries(box)) $(key + field).value = value;
  $('captionTemplateDialog').showModal();
  updateCaptionEditor();
}

function readCaptionTemplate(current) {
  return {
    id:
      current?.id ||
      (captionTemplatePreset ? 'preset-' + captionTemplatePreset : crypto.randomUUID()),
    name: $('captionTemplateName').value,
    background: $('captionTemplateBackground').value,
    backgroundFit: $('captionTemplateFit').value,
    canvasAnchor: captionEditAnchor,
    appearance: readCaptionAppearance(),
    position: current?.position || { x: state.style.captionX, y: state.style.captionY },
    backgroundBox: templateBox('backgroundBox'),
    textBox: templateBox('textBox'),
  };
}

const captionPackageURL = '/api/stage/caption-package';

async function exportCaptionTemplate() {
  const form = $('captionTemplateForm');
  if (!form.reportValidity()) return;
  const current = state.captionTemplates.find(({ id }) => id === captionTemplateDraft);
  const template = readCaptionTemplate(current);
  const url = captionPackageURL + '?' + new URLSearchParams({ template: JSON.stringify(template) });
  const button = $('exportCaptionTemplate');
  const status = $('captionTemplateStatus');
  button.disabled = true;
  status.textContent = '正在检查模板素材…';
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) throw Error('无法导出模板。请检查背景和字体素材是否可用。');
    const link = document.createElement('a');
    link.href = url;
    link.download = template.name.trim().replace(/[<>:"/\\|?*]/g, '_') + '.stage-caption';
    link.click();
    status.textContent = '已发起模板下载。';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function importCaptionTemplate() {
  const input = $('importCaptionTemplate');
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  input.disabled = true;
  notice('正在导入字幕模板和素材…');
  try {
    const response = await fetch(captionPackageURL, { method: 'POST', body: file });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '字幕模板导入失败');
    await Promise.all([loadAssets(), read()]);
    notice('已导入字幕模板「' + result.template.name + '」。');
  } finally {
    input.disabled = false;
  }
}

function renderCaptionTemplateCards() {
  const signature = JSON.stringify([
    state.templateId,
    state.captionTemplateId,
    state.captionTemplates,
  ]);
  if (signature === captionCardsSignature) return;
  captionCardsSignature = signature;
  const builtins = templates.map((preset) => ({
    preset,
    item: state.captionTemplates.find(({ id }) => id === 'preset-' + preset.id),
  }));
  const overrides = new Set(builtins.map(({ item }) => item?.id));
  const custom = state.captionTemplates
    .filter(({ id }) => !overrides.has(id))
    .map((item) => ({ item }));
  $('templates').replaceChildren(
    ...[...builtins, ...custom].map(({ item, preset }) => captionTemplateCard(item, preset)),
  );
}

function captionTemplateCard(item, preset) {
  const label = item?.name || preset.name;
  const card = document.createElement('div');
  card.className = 'caption-template-card';
  const use = document.createElement('button');
  use.type = 'button';
  use.className = 'template';
  if (preset) use.dataset.id = preset.id;
  use.setAttribute(
    'aria-pressed',
    String(
      state.captionTemplateId
        ? state.captionTemplateId === item?.id
        : state.templateId === preset?.id,
    ),
  );
  const sample = document.createElement('span');
  sample.className = 'template-sample';
  const style = { ...preset, ...item?.appearance };
  for (const [key, setting] of [
    ['bg', 'background'],
    ['fg', 'foreground'],
    ['accent', 'accent'],
  ])
    if (style[setting]) sample.style.setProperty('--sample-' + key, style[setting]);
  if (style.font && style.font !== 'template') sample.style.fontFamily = style.font;
  const title = document.createElement('strong');
  title.textContent = preset?.sample?.[0] || (preset ? '弦乐合奏' : '字幕条');
  const subtitle = document.createElement('small');
  subtitle.textContent = preset?.sample?.[1] || (preset ? '青年交响乐团' : '');
  sample.append(title, subtitle);
  const name = document.createElement('strong');
  name.textContent = label;
  const description = document.createElement('small');
  description.textContent = preset?.description || '自定义字幕';
  use.append(sample, name, description);
  use.onmouseenter = use.onfocus = () => syncDockPreview(preset?.id || '', item?.id || '');
  use.onmouseleave = use.onblur = () => syncDockPreview();
  use.onclick = run(async () => {
    await write({ ...(preset && { templateId: preset.id }), captionTemplateId: item?.id || '' });
    notice('已选用「' + label + '」');
  });
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'caption-template-edit';
  edit.textContent = '编辑';
  edit.setAttribute('aria-label', '编辑 ' + label);
  edit.onclick = () => openCaptionEditor(item, preset);
  card.append(use, edit);
  return card;
}

function installCaptionEditor() {
  const form = $('captionTemplateForm');
  const dialog = $('captionTemplateDialog');
  captionPreview = StageMedia.mount($('captionPreviewFootage'));
  StageCaptions.setCaptionText($('captionPreviewText'), '歌词字幕 Aa 123', true);
  for (const id of ['captionEnterEffect', 'captionExitEffect'])
    replaceOptions($(id), captionEffectOptions);
  $('previewCaptionEnter').onclick = () => previewCaptionEffect(true);
  $('previewCaptionExit').onclick = () => previewCaptionEffect(false);
  $('exportCaptionTemplate').onclick = exportCaptionTemplate;
  $('importCaptionTemplate').onchange = run(importCaptionTemplate);
  for (const [key, label] of Object.entries(captionBoxes)) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = label;
    group.append(legend);
    for (const [field, title] of Object.entries(geometryFields)) {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.id = key + field;
      input.type = 'number';
      input.min = field === 'x' || field === 'y' ? -16000 : 1;
      input.max = 16000;
      input.required = true;
      row.append(title, input);
      group.append(row);
    }
    $('captionTemplateGeometry').append(group);
  }
  $('createCaptionTemplate').onclick = () => openCaptionEditor();
  $('captionTemplateCancel').onclick = () => dialog.close();
  dialog.onclose = () => {
    closeFontList();
    resetCaptionPreviewEffect();
    captionPreview.stop();
  };
  form.oninput = () => {
    resetCaptionPreviewEffect();
    updateCaptionEditor();
  };
  const submit = async (action) => {
    $('captionTemplateStatus').textContent = '';
    try {
      await action();
      dialog.close();
    } catch (error) {
      $('captionTemplateStatus').textContent = error.message;
    }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    return submit(async () => {
      const current = state.captionTemplates.find(({ id }) => id === captionTemplateDraft);
      if (captionTemplateDraft && !current) throw Error('找不到所选模板');
      const template = readCaptionTemplate(current);
      const copy = event.submitter?.id === 'saveCaptionCopy';
      if (copy) {
        template.id = crypto.randomUUID();
        if (template.name.trim() === captionOriginalName)
          template.name = captionOriginalName.slice(0, 75) + ' · 副本';
      }
      const { id } = template;
      const captionTemplates =
        current && !copy
          ? state.captionTemplates.map((entry) => (entry.id === id ? template : entry))
          : [...state.captionTemplates, template];
      const captionTemplateId = copy
        ? state.captionTemplateId
        : $('captionTemplateDefault').checked
          ? id
          : state.captionTemplateId === id
            ? ''
            : state.captionTemplateId;
      await write({
        captionTemplates,
        captionTemplateId,
        ...(captionTemplatePreset &&
          captionTemplateId === id && { templateId: captionTemplatePreset }),
      });
      notice(copy ? '已保存字幕模板副本' : '字幕模板已保存');
    });
  };
  $('captionTemplateDelete').onclick = () =>
    submit(async () => {
      const id = captionTemplateDraft;
      if (dirty && $('programCaptionTemplate').value === id) throw Error('请先保存当前节目');
      await write({
        captionTemplates: state.captionTemplates.filter((entry) => entry.id !== id),
        captionTemplateId: state.captionTemplateId === id ? '' : state.captionTemplateId,
        programs: state.programs.map((entry) =>
          entry.captionTemplateId === id ? { ...entry, captionTemplateId: '' } : entry,
        ),
      });
      notice('已删除模板，关联节目改用活动默认');
    });
  for (const [id, key] of [
    ['captionPreviewBackground', 'backgroundBox'],
    ['captionPreviewText', 'textBox'],
  ]) {
    const node = $(id);
    let drag;
    node.onpointerdown = (event) => {
      if (event.button !== 0) return;
      drag = {
        clientX: event.clientX,
        clientY: event.clientY,
        ...templateBox(key),
        scale: captionPreviewFrame.scale,
      };
      node.setPointerCapture(event.pointerId);
    };
    node.onpointermove = (event) => {
      if (!drag || !node.hasPointerCapture(event.pointerId)) return;
      for (const axis of ['x', 'y']) {
        const client = 'client' + axis.toUpperCase();
        $(key + axis).value = Math.max(
          -16000,
          Math.min(16000, Math.round(drag[axis] + (event[client] - drag[client]) / drag.scale)),
        );
      }
      updateCaptionEditor(true);
    };
    node.onlostpointercapture = () => {
      drag = null;
      updateCaptionEditor();
    };
  }
}

function installShowControls() {
  $('roundView').onchange = run(() => {
    const next = $('roundView').value;
    if (dirty) {
      $('roundView').value = roundView;
      throw Error('请先保存当前节目');
    }
    showRound(next);
  });
  $('roundForm').onsubmit = run(async () => {
    if (dirty) throw Error('请先保存当前节目');
    const name = $('roundName').value.trim();
    if (!name) throw Error('请填写轮次名称');
    const id = crypto.randomUUID();
    await write({ rounds: [...state.rounds, { id, name }] });
    $('roundName').value = '';
    showRound(id);
  });
  $('renameRound').onclick = run(async () => {
    const name = $('roundName').value.trim();
    if (!name) throw Error('请在轮次名称框填写新名称');
    await write({
      rounds: state.rounds.map((round) => (round.id === roundView ? { ...round, name } : round)),
    });
    $('roundName').value = '';
  });
  $('deleteRound').onclick = run(async () => {
    await write({ rounds: state.rounds.filter(({ id }) => id !== roundView) });
    showRound('');
  });
  $('replayAnnouncement').onclick = run(() => command('announcement.play'));

  installCaptionEditor();
  installMediaImport();
}

function installMediaImport() {
  const dialog = $('mediaImportDialog');
  const input = $('mediaImportFiles');
  const status = $('mediaImportStatus');
  let target,
    importing = false;
  document.querySelectorAll('[data-media-import]').forEach((button) => {
    button.onclick = () => {
      target = $(button.dataset.mediaImport);
      $('mediaImportTitle').textContent = button.textContent;
      input.value = '';
      input.accept =
        target.dataset.assets === 'video'
          ? '.mov,.mp4,.webm,.png'
          : '.png,.jpg,.jpeg,.webp,.mov,.mp4,.webm';
      $('mediaFpsField').hidden = true;
      status.textContent = '';
      dialog.showModal();
    };
  });
  input.onchange = () => {
    $('mediaFpsField').hidden = input.files.length < 2;
  };
  $('mediaImportCancel').onclick = () => dialog.close();
  dialog.oncancel = (event) => {
    if (importing) event.preventDefault();
  };
  $('mediaImportForm').onsubmit = async (event) => {
    event.preventDefault();
    if (importing || !input.files.length) return;
    const files = [...input.files];
    const sequence = files.length > 1;
    const png = files.every((file) => /\.png$/i.test(file.name));
    if ((sequence && !png) || (!sequence && png && target.dataset.assets === 'video')) {
      status.textContent = '请选一个视频，或多选同一组 PNG 帧。';
      return;
    }
    const order = new Intl.Collator('zh-CN', { numeric: true });
    files.sort((a, b) => order.compare(a.name, b.name) || a.name.localeCompare(b.name));
    const fps = Number($('mediaImportFps').value);
    if (sequence && (fps < 1 || fps > 60)) {
      status.textContent = '请输入 1–60 fps 的帧率。';
      return;
    }
    const content = sequence ? new Blob(files) : files[0];
    const query = new URLSearchParams({ name: files[0].name });
    if (sequence) query.set('fps', fps);
    importing = true;
    $('mediaImportConfirm').disabled = $('mediaImportCancel').disabled = input.disabled = true;
    status.textContent =
      sequence || /\.mov$/i.test(files[0].name) ? '正在上传和转换素材…' : '正在导入素材…';
    try {
      const response = await fetch('/api/stage/media?' + query, { method: 'POST', body: content });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      await loadAssets();
      target.value = result.asset.file;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      renderAssetTarget(target);
      dialog.close();
      notice('素材已导入。保存当前设置后即可使用。');
    } catch (error) {
      status.textContent = error.message;
    } finally {
      importing = false;
      $('mediaImportConfirm').disabled = $('mediaImportCancel').disabled = input.disabled = false;
    }
  };
}
