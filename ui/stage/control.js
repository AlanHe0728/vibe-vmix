'use strict';
const $ = (id) => document.getElementById(id);
const fields = [
  'programType',
  'programTitle',
  'programPerformer',
  'programSubtitle',
  'programCaption',
];
const layerLabels = {
  channel: '台标',
  event: '活动 Logo',
  sponsor: '赞助商',
  lower: '节目字幕条',
  caption: '字幕内容',
};
const numericStyles = ['fontSize', 'transitionMs'];
let state,
  templates = [],
  assets = [],
  selected = '',
  dirty = false,
  designDirty = false,
  etag = '',
  writing = false,
  jobTimer,
  formSignature = '';
function notice(message = '') {
  $('notice').textContent = message;
}
async function api(url, payload) {
  const response = await fetch(
    url,
    payload === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
  );
  const body = await response.json();
  if (!response.ok || body.ok === false) throw Error(body.error || '请求失败');
  return body;
}
async function read() {
  const response = await fetch('/api/v1/state', {
    cache: 'no-store',
    headers: etag ? { 'If-None-Match': etag } : {},
  });
  if (response.status === 304) return;
  if (!response.ok) throw Error('读取舞台状态失败');
  state = await response.json();
  etag = response.headers.get('ETag') || '';
  renderState();
}
async function write(patch) {
  if (writing) throw Error('正在保存，请稍后再操作');
  writing = true;
  try {
    await api('/api/v1/state', patch);
    etag = '';
    await read();
  } finally {
    writing = false;
  }
}
async function command(id, payload = {}) {
  await api('/api/v1/commands/' + id, payload);
  etag = '';
  await read();
}
function run(action) {
  return async (event) => {
    event?.preventDefault();
    notice();
    try {
      await action(event);
    } catch (error) {
      notice(error.message);
    }
  };
}
function markDirty() {
  dirty = true;
  $('draftState').textContent = '有未保存修改';
  renderCaptions();
}
function fillProgram() {
  const item = state.programs.find((program) => program.id === selected);
  $('programForm')
    .querySelectorAll('input,select,textarea,button')
    .forEach((input) => {
      input.disabled = !item;
    });
  const values = [
    item?.type || '歌唱',
    item?.title || '',
    item?.performer || '',
    item?.subtitle || '',
    item?.caption || '',
  ];
  fields.forEach((id, index) => {
    $(id).value = values[index];
  });
  formSignature = JSON.stringify(item || null);
  dirty = false;
  $('draftState').textContent = '';
  renderCaptions();
}
function renderCaptions() {
  if (!state) return;
  const item = state.programs.find((program) => program.id === selected);
  const entries = StageCaptions.lines($('programCaption').value);
  const active = state.captionLive;
  const sameProgram = Boolean(item && active?.programId === item.id);
  const sameLyrics = Boolean(sameProgram && active.caption === item.caption && !dirty);
  $('captionCount').textContent = entries.length + ' 句';
  $('captionHint').textContent = !item
    ? '先添加节目，再录入歌词或字幕。'
    : dirty
      ? '保存节目后，可以逐句播出。'
      : !entries.length
        ? '在上方输入歌词，每行一句。'
        : sameProgram && !sameLyrics
          ? '字幕已修改，请点选一句播出新内容。'
          : sameLyrics
            ? (state.layers.caption ? '正在播出第 ' : '已下屏，当前为第 ') +
              (active.index + 1) +
              ' 句。'
            : '点选任意一句，或从第一句开始播出。';
  $('captionPrevious').disabled = !sameLyrics || active.index <= 0;
  $('captionNext').disabled =
    !item ||
    dirty ||
    !entries.length ||
    (sameProgram && !sameLyrics) ||
    (sameLyrics && active.index >= entries.length - 1);
  $('captionNext').textContent = sameProgram ? '下一句' : '播出第一句';
  $('captionHide').disabled = !state.layers.caption;
  const list = $('captionList');
  const scrollTop = list.scrollTop;
  const focused = document.activeElement?.dataset?.captionIndex;
  list.replaceChildren();
  const programId = selected;
  entries.forEach((line, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'caption-row';
    button.dataset.captionIndex = String(index);
    button.disabled = !item || dirty;
    const current = sameLyrics && active.index === index;
    button.setAttribute('aria-current', String(current));
    button.setAttribute('aria-label', '播出第 ' + (index + 1) + ' 句：' + line);
    const number = document.createElement('span');
    number.className = 'caption-row-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const content = document.createElement('span');
    content.className = 'caption-row-text';
    content.textContent = line;
    button.append(number, content);
    if (current) {
      const status = document.createElement('span');
      status.className = 'caption-row-state';
      status.textContent = state.layers.caption ? '上屏' : '已下屏';
      button.append(status);
    }
    button.onclick = run(() => command('caption.take', { programId, index }));
    li.append(button);
    list.append(li);
  });
  list.scrollTop = scrollTop;
  if (focused !== undefined)
    list.querySelector('[data-caption-index="' + focused + '"]')?.focus({ preventScroll: true });
}
function selectProgram(id) {
  if (dirty) {
    notice('请先保存当前节目，再切换。');
    return;
  }
  selected = id;
  fillProgram();
  renderList();
}
function renderList() {
  $('programList').replaceChildren();
  $('emptyPrograms').hidden = state.programs.length > 0;
  state.programs.forEach((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'program-row';
    button.setAttribute('aria-current', String(item.id === selected));
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.title || '未命名节目';
    const detail = document.createElement('small');
    detail.textContent = [item.type, item.performer].filter(Boolean).join(' · ');
    text.append(title, detail);
    button.append(text);
    if (state.live?.id === item.id) {
      const label = document.createElement('span');
      label.className = 'on-air';
      label.textContent = '播出';
      button.append(label);
    }
    button.onclick = () => selectProgram(item.id);
    li.append(button);
    $('programList').append(li);
  });
}
function fillDesign() {
  for (const key of [
    'channelName',
    'eventName',
    'sponsorName',
    'channelAsset',
    'eventAsset',
    'sponsorAsset',
    'transitionAsset',
  ])
    $(key).value = state[key];
  for (const key of ['accent', 'background', 'foreground', 'font', ...numericStyles])
    $(key).value = state.style[key];
  $('motion').checked = state.style.motion;
  for (const [key, id] of [
    ['port', 'vmixPort'],
    ['input', 'vmixInput'],
    ['titleField', 'titleField'],
    ['subtitleField', 'subtitleField'],
    ['overlay', 'overlay'],
  ])
    $(id).value = state.vmix[key];
}
function renderState() {
  if (!selected || !state.programs.some((item) => item.id === selected)) {
    selected = state.programs[0]?.id || '';
    if (!dirty) fillProgram();
  } else if (
    !dirty &&
    JSON.stringify(state.programs.find((item) => item.id === selected) || null) !== formSignature
  )
    fillProgram();
  renderList();
  renderCaptions();
  $('liveTitle').textContent = state.live ? state.live.title : '尚未播出节目';
  $('take').disabled = !selected;
  $('next').disabled = !state.programs.length;
  for (const key of Object.keys(layerLabels))
    $('layer-' + key).setAttribute('aria-pressed', String(state.layers[key]));
  document
    .querySelectorAll('.template')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.id === state.templateId)),
    );
  if (!designDirty) fillDesign();
}
for (const [key, title] of Object.entries(layerLabels)) {
  const button = document.createElement('button');
  button.id = 'layer-' + key;
  button.textContent = title;
  button.setAttribute('aria-pressed', 'false');
  button.onclick = run(() => {
    if (key === 'caption' && !state.layers.caption && !state.captionLive)
      return command('caption.take', { programId: selected, index: 0 });
    return write({ layers: { [key]: !state.layers[key] } });
  });
  $('layerControls').append(button);
}
document.querySelectorAll('[data-tab]').forEach((button) => {
  button.onclick = () => {
    document
      .querySelectorAll('[data-tab]')
      .forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
    document.querySelectorAll('.tab').forEach((section) => {
      section.hidden =
        section.id !== (button.dataset.tab === 'connection' ? 'connectionTab' : button.dataset.tab);
    });
  };
});
fields.forEach((id) => $(id).addEventListener('input', markDirty));
$('designForm').addEventListener('input', () => {
  designDirty = true;
});
$('vmixForm').addEventListener('input', () => {
  designDirty = true;
});
$('addProgram').onclick = run(async () => {
  if (dirty) throw Error('请先保存当前节目');
  const item = {
    id: crypto.randomUUID(),
    type: '歌唱',
    title: '',
    performer: '',
    subtitle: '',
    caption: '',
  };
  await write({ programs: [...state.programs, item] });
  selected = item.id;
  fillProgram();
  renderList();
  $('programTitle').focus();
});
$('programForm').onsubmit = run(async () => {
  const item = {
    id: selected,
    type: $('programType').value,
    title: $('programTitle').value,
    performer: $('programPerformer').value,
    subtitle: $('programSubtitle').value,
    caption: $('programCaption').value,
  };
  await write({ programs: state.programs.map((entry) => (entry.id === selected ? item : entry)) });
  fillProgram();
  $('draftState').textContent = '已保存';
});
for (const [id, direction] of [
  ['moveUp', -1],
  ['moveDown', 1],
])
  $(id).onclick = run(async () => {
    if (dirty) throw Error('请先保存当前节目');
    const list = [...state.programs],
      index = list.findIndex((item) => item.id === selected),
      target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await write({ programs: list });
  });
let deleted;
$('deleteProgram').onclick = run(async () => {
  if (!selected) return;
  deleted = {
    item: state.programs.find((item) => item.id === selected),
    index: state.programs.findIndex((item) => item.id === selected),
  };
  await write({ programs: state.programs.filter((item) => item.id !== selected) });
  dirty = false;
  fillProgram();
  notice('已删除节目。');
  const undo = document.createElement('button');
  undo.textContent = '撤销删除';
  undo.onclick = run(async () => {
    const list = [...state.programs];
    list.splice(deleted.index, 0, deleted.item);
    await write({ programs: list });
    deleted = null;
  });
  $('notice').append(' ', undo);
});
$('take').onclick = run(async () => {
  if (dirty) throw Error('请先保存，再播出节目');
  await command('program.take', { id: selected });
});
$('next').onclick = run(() => command('program.next'));
$('captionPrevious').onclick = run(() => command('caption.previous', { programId: selected }));
$('captionNext').onclick = run(() => command('caption.next', { programId: selected }));
$('captionHide').onclick = run(() => command('caption.hide'));
$('hideAll').onclick = run(() => command('all.hide'));
$('transition').onclick = run(() => command('transition.play'));
function openPreview() {
  if (window.parent !== window) window.parent.postMessage({ type: 'open-preview' }, '*');
  else window.open('/stage/graphics.html?preview=1', '_blank');
}
$('togglePreview').onclick = openPreview;
$('designPreview').onclick = openPreview;
$('designForm').onsubmit = run(async () => {
  const patch = { style: {} };
  for (const key of [
    'channelName',
    'eventName',
    'sponsorName',
    'channelAsset',
    'eventAsset',
    'sponsorAsset',
    'transitionAsset',
  ])
    patch[key] = $(key).value;
  for (const key of ['accent', 'background', 'foreground', 'font']) patch.style[key] = $(key).value;
  for (const key of numericStyles) patch.style[key] = Number($(key).value);
  patch.style.motion = $('motion').checked;
  await write(patch);
  designDirty = false;
  notice('包装设置已保存');
});
$('resetColors').onclick = () => {
  ['accent', 'background', 'foreground'].forEach((key) => {
    $(key).value = '';
  });
  designDirty = true;
};
$('exportShow').onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: 'broadcast-stage-rundown', version: 1, programs: state.programs },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '舞台节目单.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
$('importShow').onchange = run(async () => {
  if (dirty) throw Error('请先保存当前节目');
  const file = $('importShow').files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) throw Error('节目单不能超过 1 MB');
  const imported = JSON.parse(await file.text());
  if (
    imported.format !== 'broadcast-stage-rundown' ||
    imported.version !== 1 ||
    !Array.isArray(imported.programs)
  )
    throw Error('节目单格式无效');
  // Import appends with fresh IDs, preserving the existing show and live snapshot.
  await write({
    programs: [
      ...state.programs,
      ...imported.programs.map((item) => ({ ...item, id: crypto.randomUUID() })),
    ],
  });
  notice('节目已追加到节目单');
  $('importShow').value = '';
});
function assetOptions() {
  document.querySelectorAll('[data-assets]').forEach((select) => {
    const value = select.value || state?.[select.id] || '';
    select.replaceChildren(new Option('不使用', ''));
    assets
      .filter(
        (item) =>
          item.available &&
          item.kind === select.dataset.assets &&
          (select.dataset.assets !== 'video' || /\.(webm|mp4)$/i.test(item.file)),
      )
      .forEach((item) => {
        select.add(new Option(item.name, item.file));
      });
    select.value = value;
  });
  const prior = $('renderSource').value;
  $('renderSource').replaceChildren(new Option('选择 AE 工程', ''));
  assets
    .filter((item) => item.kind === 'ae' && item.available)
    .forEach((item) => $('renderSource').add(new Option(item.name, item.id)));
  $('renderSource').value = prior;
}
const formatLabels = {
  image: '图片 · 内置包装可用',
  video: '视频 · 可添加到 vMix',
  gt: 'GT 标题 · vMix 原生渲染',
  ae: 'AE 工程 · 需 AE 渲染',
  newblue: 'NewBlue 工程 · 需原软件导出',
};
async function loadAssets() {
  assets = (await api('/api/stage/library')).assets;
  $('assetList').replaceChildren();
  if (!assets.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '尚未导入素材';
    $('assetList').append(p);
  }
  assets.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'asset-row';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.name;
    const info = document.createElement('small');
    info.textContent =
      (item.bytes / 1024 / 1024).toFixed(1) +
      ' MB · ' +
      (item.sourcePath ? '链接原文件' : '已复制到素材库');
    text.append(title, info);
    const status = document.createElement('small');
    status.textContent = item.available ? formatLabels[item.kind] : '文件已移动或不存在';
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (['gt', 'image', 'video'].includes(item.kind)) {
      const add = document.createElement('button');
      add.textContent = '添加到 vMix';
      add.disabled = !item.available;
      add.onclick = run(async () => {
        await api('/api/stage/vmix', { action: 'add', id: item.id });
        notice('已发送到 vMix。请在 vMix 中检查输入。');
      });
      actions.append(add);
    }
    if (['ae', 'newblue', 'gt'].includes(item.kind)) {
      const open = document.createElement('button');
      open.textContent = '原软件打开';
      open.disabled = !item.available;
      open.onclick = () => {
        const file = item.sourcePath;
        window.parent.postMessage(
          {
            type: 'open-source',
            path: file || '',
            assetId: item.id,
            moduleOrigin: location.origin,
          },
          '*',
        );
        if (window.parent === window && !window.chrome?.webview)
          notice('请在桌面程序中使用原软件打开，或从素材库文件夹手动打开。');
      };
      actions.append(open);
    }
    row.append(text, status, actions);
    $('assetList').append(row);
  });
  assetOptions();
}
$('upload').onchange = run(async () => {
  const input = $('upload');
  input.disabled = true;
  try {
    for (const file of input.files) {
      if (file.size > 512 * 1024 * 1024) throw Error('单个素材最多 512 MB');
      notice('正在导入：' + file.name);
      const response = await fetch('/api/stage/upload?name=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
    }
    await loadAssets();
    notice('导入完成。AE / NewBlue 工程的关联素材请保持可访问；推荐使用“链接本地工程”。');
  } finally {
    input.value = '';
    input.disabled = false;
  }
});
$('registerSource').onclick = () => {
  if (window.parent === window && !window.chrome?.webview) {
    notice('请在桌面程序中链接本地工程；也可以用“导入文件”复制工程。');
    return;
  }
  window.parent.postMessage({ type: 'import-source' }, '*');
};
window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(event.origin) ||
    event.data?.type !== 'native-source'
  )
    return;
  run(async () => {
    await api('/api/stage/register', { path: event.data.path });
    await loadAssets();
    notice('工程已链接，保留原路径。');
  })();
});
$('renderForm').onsubmit = run(async () => {
  await api('/api/stage/render', {
    id: $('renderSource').value,
    composition: $('composition').value,
    outputModule: $('outputModule').value,
  });
  notice('AE 正在后台渲染，请避免在正式播出时运行重型渲染。');
  pollJobs();
});
async function pollJobs() {
  clearTimeout(jobTimer);
  try {
    const jobs = (await api('/api/stage/render')).jobs;
    $('renderLog').textContent = jobs
      .map(
        (job) =>
          ({ running: '渲染中', done: '渲染完成', failed: '渲染失败' })[job.status] +
          '\n' +
          job.log,
      )
      .join('\n\n');
    if (jobs.some((job) => job.status === 'running')) jobTimer = setTimeout(pollJobs, 2000);
    else if (jobs.length) await loadAssets();
  } catch (error) {
    notice(error.message);
  }
}
$('outputURL').value = location.origin + '/stage/graphics.html';
$('copyURL').onclick = run(async () => {
  await navigator.clipboard.writeText($('outputURL').value);
  notice('上屏地址已复制');
});
$('openOutput').onclick = openPreview;
$('vmixForm').onsubmit = run(async () => {
  await write({
    vmix: {
      port: Number($('vmixPort').value),
      input: $('vmixInput').value,
      titleField: $('titleField').value,
      subtitleField: $('subtitleField').value,
      overlay: Number($('overlay').value),
    },
  });
  designDirty = false;
  notice('连接设置已保存');
});
document.querySelectorAll('[data-vmix]').forEach((button) => {
  button.onclick = run(async () => {
    await api('/api/stage/vmix', { action: button.dataset.vmix });
    notice(button.dataset.vmix === 'connect' ? 'vMix 连接成功' : 'vMix 操作成功');
  });
});
async function poll() {
  try {
    if (!writing) await read();
    $('connection').textContent = '本地服务已连接';
  } catch (error) {
    $('connection').textContent = '连接中断';
    notice(error.message);
  }
  setTimeout(poll, document.hidden ? 5000 : 1500);
}
async function init() {
  templates = (await api('/api/stage/templates')).templates;
  for (const template of templates) {
    const button = document.createElement('button');
    button.className = 'template';
    button.dataset.id = template.id;
    const sample = document.createElement('span');
    sample.className = 'template-sample';
    sample.style.setProperty('--sample-bg', template.background);
    sample.style.setProperty('--sample-fg', template.foreground);
    sample.style.setProperty('--sample-accent', template.accent);
    sample.style.fontFamily = template.font;
    const title = document.createElement('strong');
    title.textContent = '节目名称';
    const subtitle = document.createElement('small');
    subtitle.textContent = '示例 · 表演者 / 演出单位';
    sample.append(title, subtitle);
    const name = document.createElement('strong');
    name.textContent = template.name;
    const description = document.createElement('small');
    description.textContent = template.description;
    button.append(sample, name, description);
    button.onclick = run(async () => {
      await write({
        templateId: template.id,
        style: { accent: '', background: '', foreground: '', font: 'template' },
      });
      for (const key of ['accent', 'background', 'foreground']) $(key).value = '';
      $('font').value = 'template';
    });
    $('templates').append(button);
  }
  await read();
  await loadAssets();
  fillDesign();
  fillProgram();
  poll();
  pollJobs();
}
init().catch((error) => notice(error.message));
