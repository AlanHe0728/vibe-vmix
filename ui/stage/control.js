'use strict';
document.body.classList.toggle(
  'embedded',
  new URLSearchParams(location.search).get('workspace') === '1',
);
const $ = (id) => document.getElementById(id);
const followCaption = StageCaptions.createCaptionFollower();
const fields = [
  'programType',
  'programTitle',
  'programPerformer',
  'programSubtitle',
  'programCaption',
  'programRound',
  'announcementAsset',
  'programCaptionTemplate',
];
const layerLabels = {
  channel: '台标',
  event: '活动logo',

  caption: '字幕条',
};
let state,
  collaboration,
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
async function api(url, payload, headers = {}) {
  const response = await fetch(
    url,
    payload === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
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
    const structured = ['programs', 'rounds', 'captionTemplates', 'promotions', 'awards'].some((key) =>
      Object.hasOwn(patch, key),
    );
    await api('/api/v1/state', patch, structured && etag ? { 'If-Match': etag } : {});
    etag = '';
    await read();
  } finally {
    writing = false;
  }
}
async function command(id, payload = {}, headers = {}) {
  await api('/api/v1/commands/' + id, payload, headers);
  await Promise.all([read(), readCollaboration()]);
}
const collaborationURL = '/api/stage/collaboration';
async function readCollaboration(payload) {
  const next = await api(collaborationURL, payload);
  if (JSON.stringify(collaboration) === JSON.stringify(next)) return;
  collaboration = next;
  renderCollaboration();
  renderCaptions();
}
function replaceOptions(select, entries) {
  const prior = select.value;
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  if (entries.some(([value]) => value === prior)) select.value = prior;
}
function canTake() {
  return (
    collaboration &&
    !collaboration.busy &&
    (!collaboration.session.active || collaboration.session.owns)
  );
}
function renderCollaboration() {
  const { session, live, prepared, native, busy } = collaboration;
  $('captionOnAir').textContent = live.uncertain
    ? '请在 vMix 中确认播出状态'
    : live.visible
      ? live.text + (live.operator ? ' · ' + live.operator : '')
      : '已下屏';
  $('captionOwner').textContent = session.active ? session.owner || '等待接手' : '导播主机';
  $('captionPrepared').textContent = prepared
    ? prepared.text + ' · ' + prepared.operator
    : '尚未选句';
  $('captionTake').disabled = !prepared || !canTake();
  $('openLan').hidden = session.active;
  $('openLan').disabled = !session.addresses.length || busy;
  $('stopLan').hidden = !session.active;
  $('stopLan').disabled = busy;
  $('lanInvite').hidden = !session.active;
  $('lanAddress').disabled = session.active;
  $('joinUrl').value = session.url || '';
  $('joinCode').value = session.code || '';
  replaceOptions(
    $('lanAddress'),
    session.addresses.map((value) => [value, value]),
  );
  replaceOptions(
    $('lanTarget'),
    session.clients.map((client) => [client.id, client.name]),
  );
  $('lanTransfer').disabled = !session.owns || !session.clients.length || busy;
  $('lanClaim').disabled = session.owns || busy;
  $('layer-caption').disabled = !canTake() || !(live.visible || live.uncertain || prepared);
  $('layer-caption').setAttribute('aria-pressed', String(live.visible));
  $('applyGtLayer').disabled = !canTake();
  $('captionHide').disabled = !canTake() || !(live.visible || live.uncertain);
  for (const id of ['take', 'next', 'hideAll'])
    $(id).disabled =
      !canTake() ||
      (id === 'take' && !selected) ||
      (id === 'next' && !currentRoundPrograms().length);
  document.querySelectorAll('[data-vmix]').forEach((button) => {
    button.disabled = !canTake() || (native && ['text', 'show'].includes(button.dataset.vmix));
  });
  if (state) syncAwards();
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
    item?.roundId || '',
    item?.announcementAsset || '',
    item?.captionTemplateId || '',
  ];
  fields.forEach((id, index) => {
    if ($(id).hasAttribute('data-assets')) setAssetOption($(id), values[index]);
    else $(id).value = values[index];
  });
  formSignature = JSON.stringify(item || null);
  dirty = false;
  $('draftState').textContent = '';
  renderCaptions();
  syncDockPreview();
}
function renderCaptions() {
  if (!state) return;
  const item = state.programs.find((program) => program.id === selected);
  const entries = StageCaptions.lines($('programCaption').value);
  const live = collaboration?.live;
  const active = collaboration?.native ? live : state.captionLive;
  const visible = collaboration?.native ? live.visible : state.layers.caption;
  const sameProgram = Boolean(item && active?.programId === item.id);
  const sameLyrics = Boolean(
    sameProgram &&
      !dirty &&
      (collaboration?.native
        ? entries[active.index] === live.text
        : active.caption === item.caption),
  );
  $('captionCount').textContent = entries.length + ' 句';
  $('captionPrevious').disabled = !canTake() || !sameLyrics || active.index <= 0;
  $('captionNext').disabled =
    !canTake() ||
    !item ||
    dirty ||
    !entries.length ||
    (sameProgram && !sameLyrics) ||
    (sameLyrics && active.index >= entries.length - 1);
  $('captionNext').textContent = sameProgram ? '下一句' : '播出第一句';
  $('captionHide').disabled = !canTake() || !(visible || live?.uncertain);
  const list = $('captionList');
  const scrollTop = list.scrollTop;
  const focused = document.activeElement?.dataset?.captionIndex;
  list.replaceChildren();
  const programId = selected;
  const prepared = collaboration?.prepared;
  const queued = item && !dirty && prepared?.programId === programId ? prepared : undefined;
  entries.forEach((line, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'caption-row';
    button.dataset.captionIndex = String(index);
    button.disabled = !item || dirty;
    const current = sameLyrics && active.index === index;
    button.setAttribute('aria-current', String(current));
    button.setAttribute('aria-label', '准备第 ' + (index + 1) + ' 句：' + line);
    const number = document.createElement('span');
    number.className = 'caption-row-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const content = document.createElement('span');
    content.className = 'caption-row-text';
    content.textContent = line;
    button.append(number, content);
    if (current || queued?.index === index) {
      const status = document.createElement('span');
      status.className = 'caption-row-state';
      status.textContent =
        current && visible ? '上屏' : queued?.index === index ? '待播' : '已下屏';
      button.append(status);
    }
    button.onclick = run(() =>
      readCollaboration({ action: 'prepare', programId, caption: item.caption, index }),
    );
    li.append(button);
    list.append(li);
  });
  list.scrollTop = scrollTop;
  followCaption(list, programId, sameLyrics ? active.index : undefined, queued);
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
function currentRoundPrograms() {
  return state?.programs.filter((item) => item.roundId === roundView) || [];
}
function renderList() {
  $('programList').replaceChildren();
  const programs = currentRoundPrograms();
  $('emptyPrograms').hidden = programs.length > 0;
  programs.forEach((item) => {
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
  for (const key of ['channelAsset', 'eventAsset']) setAssetOption($(key), state[key]);
  document.querySelectorAll('[data-assets]').forEach(renderAssetTarget);
  for (const [key, id] of [
    ['port', 'vmixPort'],
    ['input', 'vmixInput'],
    ['titleField', 'titleField'],
    ['subtitleField', 'subtitleField'],
    ['captionField', 'captionField'],
    ['animation', 'gtAnimation'],
    ['overlay', 'overlay'],
  ])
    $(id).value = state.vmix[key];
  $('captionMode').checked = state.vmix.captionMode;
}
function renderState() {
  syncShowControls();
  syncPromotion();
  syncAwardRoster();
  if (!selected || !currentRoundPrograms().some((item) => item.id === selected)) {
    if (!dirty) selected = currentRoundPrograms()[0]?.id || '';
    if (!dirty) fillProgram();
  } else if (
    !dirty &&
    JSON.stringify(state.programs.find((item) => item.id === selected) || null) !== formSignature
  )
    fillProgram();
  renderList();
  renderCaptions();
  $('liveTitle').textContent = state.live ? state.live.title : '尚未选择节目';
  $('take').disabled = !selected;
  $('next').disabled = !currentRoundPrograms().length;
  for (const key of Object.keys(layerLabels))
    $('layer-' + key).setAttribute('aria-pressed', String(state.layers[key]));
  if (!designDirty) fillDesign();
  syncDockPreview();
  if (collaboration) renderCollaboration();
  else syncAwards();
}
for (const [key, title] of Object.entries(layerLabels)) {
  const button = document.createElement('button');
  button.id = 'layer-' + key;
  button.textContent = title;
  button.setAttribute('aria-pressed', 'false');
  button.onclick = run(() => {
    if (key === 'caption') {
      if (collaboration?.live.visible || collaboration?.live.uncertain)
        return command('caption.hide');
      return takePreparedCaption();
    }
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
      const tab = button.dataset.tab === 'connection' ? 'connectionTab' : button.dataset.tab;
      section.hidden = section.id !== tab;
    });
    const packaging = button.dataset.tab === 'promotion';
    usePackagingSidePreview(packaging ? ($('awardDesk').hidden ? 'promotion' : 'award') : '');
    if (button.dataset.tab === 'show') renderCaptions();
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
    roundId: roundView,
  };
  await write({ programs: [...state.programs, item] });
  selected = item.id;
  fillProgram();
  renderList();
  $('programEditPanel').open = true;
  $('programTitle').focus();
});
$('programForm').onsubmit = run(async () => {
  if (
    JSON.stringify(state.programs.find((entry) => entry.id === selected) || null) !== formSignature
  )
    throw Error('此节目已被其他操作员更新，请复制草稿后刷新页面');
  const item = {
    id: selected,
    type: $('programType').value,
    title: $('programTitle').value,
    performer: $('programPerformer').value,
    subtitle: $('programSubtitle').value,
    caption: $('programCaption').value,
    roundId: $('programRound').value,
    announcementAsset: $('announcementAsset').value,
    captionTemplateId: $('programCaptionTemplate').value,
  };
  await write({ programs: state.programs.map((entry) => (entry.id === selected ? item : entry)) });
  if (item.roundId !== roundView) {
    dirty = false;
    roundView = item.roundId;
    selected = item.id;
    renderState();
  }
  fillProgram();
  $('draftState').textContent = '已保存';
});
$('importLyrics').onchange = run(async () => {
  const file = $('importLyrics').files[0];
  $('importLyrics').value = '';
  if (!file) return;
  const programId = selected;
  const value = await StageCaptions.readLyrics(file);
  if (selected !== programId) throw Error('节目已切换，请重新导入');
  $('programCaption').value = value;
  markDirty();
});
for (const [id, direction] of [
  ['moveUp', -1],
  ['moveDown', 1],
])
  $(id).onclick = run(async () => {
    if (dirty) throw Error('请先保存当前节目');
    const list = [...state.programs];
    const visible = currentRoundPrograms();
    const index = visible.findIndex((item) => item.id === selected);
    const adjacent = visible[index + direction];
    if (!adjacent || index < 0) return;
    const from = list.indexOf(visible[index]);
    const to = list.indexOf(adjacent);
    [list[from], list[to]] = [list[to], list[from]];
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
  renderState();
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
  if (dirty) throw Error('请先保存节目，再播出报幕');
  if (!state.programs.find((item) => item.id === selected)?.announcementAsset)
    throw Error('请先在节目资料中绑定报幕动画');
  await command('program.take', { id: selected });
});
$('next').onclick = run(async () => {
  if (dirty) throw Error('请先保存当前节目');
  await command('program.next', { roundId: roundView });
  selectProgram(state.live.id);
});
$('captionPrevious').onclick = run(() => command('caption.previous', { programId: selected }));
$('captionNext').onclick = run(() => command('caption.next', { programId: selected }));
$('captionHide').onclick = run(() => command('caption.hide'));
async function takePreparedCaption() {
  if (!collaboration?.prepared) throw Error('请先选择要上屏的字幕');
  await readCollaboration({ action: 'take', ...collaboration.prepared });
  await read();
}
$('captionTake').onclick = run(takePreparedCaption);
$('hideAll').onclick = run(() => command('all.hide'));
function openPreview() {
  if (window.parent !== window) window.parent.postMessage({ type: 'open-preview' }, '*');
  else window.open('/stage/graphics.html?preview=1', '_blank');
}
$('togglePreview').onclick = openPreview;
$('designPreview').onclick = openPreview;
$('designForm').onsubmit = run(async () => {
  await write({ channelAsset: $('channelAsset').value, eventAsset: $('eventAsset').value });
  designDirty = false;
  notice('全场标识已保存');
});
$('exportShow').onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: 'broadcast-stage-rundown',
          version: 2,
          programs: state.programs,
          rounds: state.rounds,
          captionTemplates: state.captionTemplates,
          captionTemplateId: state.captionTemplateId,
        },
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
  $('importShow').value = '';
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) throw Error('节目单不能超过 16 MB');
  const imported = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
  if (
    imported.format !== 'broadcast-stage-rundown' ||
    ![1, 2].includes(imported.version) ||
    !Array.isArray(imported.programs)
  )
    throw Error('节目单格式无效');
  const rounds = imported.version === 2 ? imported.rounds : [];
  const lyrics = imported.version === 2 ? imported.captionTemplates : [];
  if (!Array.isArray(rounds) || !Array.isArray(lyrics)) throw Error('节目单轮次或歌词模板格式无效');
  const roundIds = new Map(rounds.map((item) => [item.id, crypto.randomUUID()]));
  const lyricsIds = new Map(lyrics.map((item) => [item.id, crypto.randomUUID()]));
  // Append the imported show and remap its internal references in one transaction.
  await write({
    rounds: [...state.rounds, ...rounds.map((item) => ({ ...item, id: roundIds.get(item.id) }))],
    captionTemplates: [
      ...state.captionTemplates,
      ...lyrics.map((item) => ({ ...item, id: lyricsIds.get(item.id) })),
    ],
    programs: [
      ...state.programs,
      ...imported.programs.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        roundId: imported.version === 1 ? roundView : roundIds.get(item.roundId) || '',
        captionTemplateId:
          lyricsIds.get(item.captionTemplateId || imported.captionTemplateId) || '',
      })),
    ],
  });
  notice('节目已追加到节目单');
});
function canBindAsset(item, kind) {
  const video = item.kind === 'video' && StageMedia.isMotion(item.file);
  if (kind === 'media') return video || item.kind === 'image';
  return kind === 'video' ? video : item.kind === kind;
}
function setAssetOption(select, value) {
  if (value && ![...select.options].some((option) => option.value === value))
    select.add(new Option('已绑定素材（等待素材库）', value));
  select.value = value;
  renderAssetTarget(select);
}
function assetOptions() {
  document.querySelectorAll('[data-assets]').forEach((select) => {
    const value = select.value;
    select.replaceChildren(new Option('不使用', ''));
    assets
      .filter((item) => item.available && canBindAsset(item, select.dataset.assets))
      .forEach((item) => {
        select.add(new Option(item.name, item.file));
      });
    select.value = value;
    if (value && select.value !== value) {
      select.add(new Option('文件不可用', value));
      select.value = value;
    }
    renderAssetTarget(select);
  });
  const prior = $('renderSource').value;
  $('renderSource').replaceChildren(new Option('选择 AE 工程', ''));
  assets
    .filter((item) => item.kind === 'ae' && item.available)
    .forEach((item) => $('renderSource').add(new Option(item.name, item.id)));
  $('renderSource').value = prior;
  renderFonts($('font').value);
}
async function loadAssets() {
  assets = (await api('/api/stage/library')).assets;
  renderLibrary();
  assetOptions();
}
function assetActions(item) {
  const actions = document.createElement('div');
  actions.className = 'actions';
  if (
    ['gt', 'image', 'video'].includes(item.kind) &&
    !/\.(?:alpha\.mp4|frames\.json)$/.test(item.file)
  ) {
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
      window.parent.postMessage(
        {
          type: 'open-source',
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
  return actions;
}
async function uploadAsset(file) {
  if (file.size > 512 * 1024 * 1024) throw Error('单个素材最多 512 MB');
  const response = await fetch('/api/stage/upload?name=' + encodeURIComponent(file.name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result.asset;
}
$('upload').onchange = run(async () => {
  const input = $('upload');
  input.disabled = true;
  try {
    for (const file of input.files) {
      notice('正在导入：' + file.name);
      await uploadAsset(file);
    }
    await loadAssets();
    notice('已导入素材');
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
    !['native-source', 'native-folder', 'native-fonts'].includes(event.data?.type)
  )
    return;
  run(async () => {
    if (event.data.type === 'native-folder') return browseFolder({ path: event.data.path });
    if (event.data.type === 'native-fonts') return setInstalledFonts(event.data.fonts);
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
      ...(!document.body.classList.contains('embedded') && { port: Number($('vmixPort').value) }),
      input: $('vmixInput').value,
      titleField: $('titleField').value,
      subtitleField: $('subtitleField').value,
      captionField: $('captionField').value,
      captionMode: $('captionMode').checked,
      animation: $('gtAnimation').value,
      overlay: Number($('overlay').value),
    },
  });
  designDirty = false;
  notice('连接设置已保存');
  await readCollaboration();
});
$('gtLayerForm').onsubmit = run(async () => {
  await api('/api/stage/vmix', {
    action: 'layer',
    layer: Number($('gtLayer').value),
    source: $('gtLayerSource').value,
  });
  notice('输入图层已更新');
});
$('openLan').onclick = run(() =>
  readCollaboration({ action: 'open', address: $('lanAddress').value }),
);
$('stopLan').onclick = run(() => readCollaboration({ action: 'stop' }));
$('lanTransfer').onclick = run(() =>
  readCollaboration({ action: 'control', target: $('lanTarget').value }),
);
$('lanClaim').onclick = run(() => readCollaboration({ action: 'control', target: 'claim' }));
$('copyInvite').onclick = run(() =>
  navigator.clipboard.writeText(
    'Vibe-vMix 协作\n' + $('joinUrl').value + '\n加入码 ' + $('joinCode').value,
  ),
);
document.querySelectorAll('[data-vmix]').forEach((button) => {
  button.onclick = run(async () => {
    await api('/api/stage/vmix', { action: button.dataset.vmix });
    await readCollaboration();
    notice(button.dataset.vmix === 'connect' ? 'vMix 连接成功' : 'vMix 操作成功');
  });
});
async function poll() {
  try {
    if (!writing) await Promise.all([read(), readCollaboration()]);
    $('connection').textContent = '本地服务已连接';
  } catch (error) {
    $('connection').textContent = '连接中断';
    notice(error.message);
  }
  setTimeout(poll, document.hidden ? 5000 : 1500);
}

async function init() {
  installShowControls();
  installPromotion();
  installAwards();
  templates = (await api('/api/stage/templates')).templates;
  await read();
  if (['#promotion', '#award'].includes(location.hash)) {
    document.querySelector('[data-tab="promotion"]').click();
    if (location.hash === '#award') switchStagePackaging('award');
  }
  await loadAssets();
  window.FBPWidgets.init();
  syncPalette();
  if (window.parent !== window) window.parent.postMessage({ type: 'list-fonts' }, '*');
  fillDesign();
  fillProgram();
  poll();
  pollJobs();
}
init().catch((error) => notice(error.message));
