'use strict';

let promotionRound;
let promotionDraft;
let promotionBaseline = '';
let promotionDirty = false;
let promotionRevision = 0;

function savedPromotion() {
  return state.promotions.find((entry) => entry.id === promotionRound) || null;
}

function updatePromotionCount() {
  const entries = promotionDraft.entries;
  const picked = entries.filter((entry) => entry.selected).length;
  $('promotionCount').textContent =
    `入选 ${picked} 人 / 总名单 ${entries.length} 人${promotionDirty ? ' · 未保存' : ''}`;
}

function changedPromotion() {
  promotionRevision++;
  promotionDirty = true;
  updatePromotionCount();
}

function editPromotionInput(entry, key, label, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.setAttribute('aria-label', `${entry.name} · ${label}`);
  input.value = entry[key] ?? '';
  input.placeholder = label;
  input.maxLength = 160;
  if (type === 'number') {
    input.step = key === 'rank' ? '1' : 'any';
    input.min = key === 'rank' ? '1' : '-1000000000';
    input.max = key === 'rank' ? '9999' : '1000000000';
  }
  input.oninput = () => {
    entry[key] =
      type === 'number' ? (input.value === '' ? null : input.valueAsNumber) : input.value;
    changedPromotion();
  };
  return input;
}

function renderPromotionEntries() {
  const search = $('promotionSearch').value.trim().toLocaleLowerCase();
  const list = $('promotionEntries');
  const rows = [];
  for (const entry of promotionDraft.entries) {
    const row = document.createElement('div');
    row.className = 'squad-row';
    row.hidden = ![entry.name, entry.title].some((value) =>
      value.toLocaleLowerCase().includes(search),
    );
    row.dataset.selected = String(entry.selected);
    const name = editPromotionInput(entry, 'name', '姓名');
    name.required = true;
    const title = editPromotionInput(entry, 'title', '节目');
    const score = editPromotionInput(entry, 'score', '分数', 'number');
    const rank = editPromotionInput(entry, 'rank', '名次', 'number');
    rank.disabled = promotionDraft.sort === 'score';
    const selected = document.createElement('input');
    selected.type = 'checkbox';
    selected.checked = entry.selected;
    selected.setAttribute('aria-label', entry.name + ' 入选');
    selected.onchange = () => {
      entry.selected = selected.checked;
      row.dataset.selected = String(selected.checked);
      changedPromotion();
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    remove.setAttribute('aria-label', '删除 ' + entry.name);
    remove.onclick = () => {
      promotionDraft.entries = promotionDraft.entries.filter((item) => item !== entry);
      changedPromotion();
      renderPromotionEntries();
    };
    row.append(name, title, score, rank, selected, remove);
    rows.push(row);
  }
  if (!rows.some((row) => !row.hidden)) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = rows.length ? '没有匹配的选手' : '暂无选手';
    rows.push(empty);
  }
  list.replaceChildren(...rows);
}

function emptyPromotion(roundId) {
  const name = state.rounds.find(({ id }) => id === roundId)?.name;
  return {
    id: roundId,
    title: name ? `${name}晋级名单` : '晋级名单',
    background: '',
    sort: 'manual',
    columns: { rank: true, name: true, title: true, score: true },
    entries: [],
  };
}

function syncPromotionDesign() {
  const options = state.stageDesigns.filter(({ slot }) => slot === 'promotion');
  replaceOptions($('promotionDesign'), [
    ['', '内置名单'],
    ...options.map(({ id, name }) => [id, name]),
  ]);
  $('promotionDesign').value = promotionDraft.designId || '';
  const disabled = !$('promotionDesign').value;
  $('editPromotionDesign').disabled = disabled;
  $('positionPromotionDesign').disabled = disabled;
}

function loadPromotionDraft() {
  const saved = savedPromotion();
  promotionDraft = saved ? structuredClone(saved) : emptyPromotion(promotionRound);
  promotionBaseline = JSON.stringify(saved);
  promotionDirty = false;
  $('promotionTitleInput').value = promotionDraft.title;
  $('promotionSort').value = promotionDraft.sort;
  setAssetOption($('promotionBackground'), promotionDraft.background);
  document.querySelectorAll('[data-promotion-column]').forEach((input) => {
    input.checked = promotionDraft.columns[input.dataset.promotionColumn];
  });
  renderPromotionEntries();
  updatePromotionCount();
  syncPromotionDesign();
}

function syncPromotion() {
  if (promotionRound === undefined) promotionRound = state.promotionRoundId ?? '';
  if (promotionRound && !state.rounds.some(({ id }) => id === promotionRound) && !promotionDirty) {
    promotionRound = '';
    promotionDraft = null;
  }
  replaceOptions($('promotionRound'), roundOptions());
  $('promotionRound').value = promotionRound;
  if (
    !promotionDraft ||
    (!promotionDirty && promotionBaseline !== JSON.stringify(savedPromotion()))
  )
    loadPromotionDraft();
  else syncPromotionDesign();
  const output = state.promotions.find(({ id }) => id === state.promotionRoundId);
  $('promotionOutputStatus').textContent = output ? `网页显示 · ${output.title || '晋级名单'}` : '';
}

function importPromotionRows(rows) {
  let headings;
  const value = (row, key, index) =>
    String(row[headings ? (headings[key] ?? -1) : index] ?? '').trim();
  const records = [];
  for (const row of rows) {
    if (!row.some((cell) => String(cell ?? '').trim())) continue;
    const labels = row.map((cell) =>
      String(cell ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase(),
    );
    const nameIndex = labels.findIndex((label) =>
      /^(选手|选手姓名|姓名|名字|name|performer)$/.test(label),
    );
    if (
      nameIndex >= 0 &&
      (!records.length ||
        labels.some((label) =>
          /^(节目|节目名称|歌曲|歌名|title|分数|得分|score|名次|rank)$/.test(label),
        ))
    ) {
      headings = {
        name: nameIndex,
        title: labels.findIndex((label) => /^(节目|节目名称|歌曲|歌名|title)$/.test(label)),
        score: labels.findIndex((label) => /^(分数|得分|score)$/.test(label)),
        rank: labels.findIndex((label) => /^(名次|排名|rank)$/.test(label)),
        selected: labels.findIndex((label) => /^(晋级|上屏|上场|selected)$/.test(label)),
      };
      continue;
    }
    const name = value(row, 'name', 0);
    if (!name) continue;
    const title = value(row, 'title', 1);
    const score = value(row, 'score', 2);
    const rank = value(row, 'rank', 3);
    const normalizeNumber = (input) => Number(input.normalize('NFKC').replace(/分$/, ''));
    const number = score ? normalizeNumber(score) : null;
    const place = rank ? normalizeNumber(rank) : null;
    if (name.length > 160 || title.length > 160)
      throw Error(`选手「${name.slice(0, 20)}」的姓名或节目过长`);
    if (number !== null && (!Number.isFinite(number) || Math.abs(number) > 1e9))
      throw Error(`「${name}」的分数无效`);
    if (place !== null && (!Number.isInteger(place) || place < 1 || place > 9999))
      throw Error(`「${name}」的名次无效`);
    records.push({
      name,
      title,
      score: number,
      rank: place,
      selected: /^(1|true|yes|是|√|✓|晋级|上屏)$/i.test(value(row, 'selected', 4)),
    });
  }
  return records;
}

function parsePromotionFile(text) {
  const input = text.replace(/^\uFEFF/, '');
  const first = input.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = ['\t', ',', ';', '，', '；'].find((separator) => first.includes(separator));
  if (!delimiter) return input.split(/\r\n|\n|\r/).map((name) => [name]);
  const workbook = XLSX.read(input, { type: 'string', raw: true, FS: delimiter, sheetRows: 302 });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: '',
  });
}

function addPromotionEntries(records) {
  const key = (entry) => JSON.stringify([entry.name.trim(), entry.title.trim()]);
  const entries = [...promotionDraft.entries];
  const known = new Map(entries.map((entry) => [key(entry), entry]));
  let added = 0;
  for (const record of records) {
    if (known.has(key(record))) continue;
    const entry = { ...record, id: crypto.randomUUID(), programId: record.programId || '' };
    known.set(key(record), entry);
    entries.push(entry);
    added++;
  }
  if (entries.length > 300) throw Error('每轮最多保存 300 名选手');
  if (added) {
    promotionDraft.entries = entries;
    changedPromotion();
    renderPromotionEntries();
  }
  notice(
    `已追加 ${added} 名选手${records.length > added ? `，跳过 ${records.length - added} 条重复名单` : ''}`,
  );
}

async function savePromotion() {
  for (const input of $('promotionEntries').querySelectorAll('input')) {
    if (!input.checkValidity()) {
      const name = input.getAttribute('aria-label');
      if (!input.closest('.squad-row').hidden) input.reportValidity();
      throw Error(`请检查 ${name}`);
    }
  }
  if (promotionBaseline !== JSON.stringify(savedPromotion()))
    throw Error('名单已在其他窗口更新，请先恢复已保存名单');
  const draft = structuredClone(promotionDraft);
  const revision = promotionRevision;
  if (promotionDirty || !savedPromotion() || state.promotionRoundId !== draft.id) {
    await write({
      promotions: [...state.promotions.filter((entry) => entry.id !== draft.id), draft],
      promotionRoundId: draft.id,
    });
    promotionBaseline = JSON.stringify(savedPromotion());
    if (revision === promotionRevision) loadPromotionDraft();
  }
}

async function syncFromRundown() {
  if (promotionBaseline !== JSON.stringify(savedPromotion()))
    throw Error('名单已在其他窗口更新，请先恢复已保存名单');
  const programs = state.programs.filter((entry) => entry.performer);
  if (!programs.length) throw Error('节目单中还没有填写选手的节目');
  const promotions = new Map(state.promotions.map((entry) => [entry.id, structuredClone(entry)]));
  if (promotionDirty) promotions.set(promotionRound, structuredClone(promotionDraft));
  const linked = new Map();
  for (const list of promotions.values())
    for (const entry of list.entries)
      if (entry.programId && !linked.has(entry.programId))
        linked.set(entry.programId, { list, entry });

  let added = 0,
    updated = 0;
  for (const { id, performer, title, roundId } of programs) {
    if (!promotions.has(roundId)) promotions.set(roundId, emptyPromotion(roundId));
    const target = promotions.get(roundId);
    const found = linked.get(id);
    const entry =
      found?.entry ??
      target.entries.find((row) => !row.programId && row.name === performer && row.title === title);
    if (!entry) {
      target.entries.push({
        id: crypto.randomUUID(),
        programId: id,
        name: performer,
        title,
        score: null,
        rank: null,
        selected: false,
      });
      added++;
      continue;
    }
    if (found && found.list !== target) {
      found.list.entries = found.list.entries.filter((row) => row !== entry);
      target.entries.push(entry);
    }
    if (
      entry.programId !== id ||
      entry.name !== performer ||
      entry.title !== title ||
      (found && found.list !== target)
    ) {
      Object.assign(entry, { programId: id, name: performer, title });
      updated++;
    }
  }
  if ([...promotions.values()].some((list) => list.entries.length > 300))
    throw Error('同步后有轮次超过 300 名选手，请先调整名单');
  const panel = $('promotion');
  panel.inert = true;
  try {
    await write({ promotions: [...promotions.values()] });
    if (!promotions.has(promotionRound)) {
      promotionRound = programs[0].roundId;
      $('promotionRound').value = promotionRound;
      $('promotionSearch').value = '';
    }
    loadPromotionDraft();
    notice(
      `已同步 ${new Set(programs.map((entry) => entry.roundId)).size} 个轮次，新增 ${added} 条，更新 ${updated} 条。`,
    );
  } finally {
    panel.inert = false;
  }
}

function installPromotion() {
  $('promotionRound').onchange = run(() => {
    const id = $('promotionRound').value;
    if (promotionDirty) {
      $('promotionRound').value = promotionRound;
      throw Error('请先保存当前轮次的名单，或恢复已保存名单');
    }
    promotionRound = id;
    $('promotionSearch').value = '';
    loadPromotionDraft();
  });
  $('promotionRestore').onclick = () => {
    loadPromotionDraft();
    notice('已恢复保存的名单');
  };
  $('promotionSearch').oninput = renderPromotionEntries;
  $('promotionTitleInput').oninput = () => {
    promotionDraft.title = $('promotionTitleInput').value;
    changedPromotion();
  };
  $('promotionDesign').onchange = () => {
    const id = $('promotionDesign').value;
    if (id) promotionDraft.designId = id;
    else delete promotionDraft.designId;
    changedPromotion();
    syncPromotionDesign();
  };
  $('importPromotionDesign').onchange = run(async () => {
    const input = $('importPromotionDesign');
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const roundId = promotionRound;
    input.disabled = true;
    try {
      const template = await importStageDesign(file, 'promotion');
      if (roundId === promotionRound) {
        promotionDraft.designId = template.id;
        changedPromotion();
        syncPromotionDesign();
      }
    } finally {
      input.disabled = false;
    }
  });
  $('editPromotionDesign').onclick = run(() => openStageDesign(promotionDraft.designId));
  $('positionPromotionDesign').onclick = run(async () => {
    const { scene } = state.stageDesigns.find(({ id }) => id === promotionDraft.designId);
    await write({
      style: {
        promotionListX: Math.round(scene.position.x),
        promotionListY: Math.round(scene.position.y),
        promotionListWidth: scene.width,
        promotionListHeight: scene.height,
      },
    });
    notice('已应用模板的名单位置和尺寸');
  });
  $('promotionSort').oninput = () => {
    promotionDraft.sort = $('promotionSort').value;
    changedPromotion();
    renderPromotionEntries();
  };
  $('promotionBackground').addEventListener('input', () => {
    promotionDraft.background = $('promotionBackground').value;
    changedPromotion();
  });
  document.querySelectorAll('[data-promotion-column]').forEach((input) => {
    input.onchange = () => {
      promotionDraft.columns[input.dataset.promotionColumn] = input.checked;
      changedPromotion();
    };
  });
  $('promotionAdd').onclick = () => {
    const form = $('promotionAddForm');
    form.hidden = !form.hidden;
    if (!form.hidden) $('promotionAddName').focus();
  };
  $('promotionAddForm').onsubmit = run(() => {
    if (promotionDraft.entries.length >= 300) throw Error('每轮最多保存 300 名选手');
    const name = $('promotionAddName').value.trim();
    if (!name) throw Error('请填写姓名');
    promotionDraft.entries.push({
      id: crypto.randomUUID(),
      programId: '',
      name,
      title: $('promotionAddTitle').value.trim(),
      score: null,
      rank: null,
      selected: false,
    });
    $('promotionAddForm').reset();
    $('promotionAddName').focus();
    changedPromotion();
    renderPromotionEntries();
  });
  $('promotionClear').onclick = () => {
    promotionDraft.entries.forEach((entry) => {
      entry.selected = false;
    });
    changedPromotion();
    renderPromotionEntries();
  };
  $('promotionFromRundown').onclick = run(syncFromRundown);
  $('promotionImportText').onclick = run(() => {
    const records = importPromotionRows(parsePromotionFile($('promotionPaste').value));
    if (!records.length) throw Error('没有找到选手姓名');
    addPromotionEntries(records);
  });
  $('promotionFile').onchange = run(async () => {
    const file = $('promotionFile').files[0];
    $('promotionFile').value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw Error('名单文件不能超过 8 MB');
    const roundId = promotionRound;
    let records;
    if (/\.xlsx?$/i.test(file.name)) {
      const book = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellHTML: false,
        cellFormula: false,
        sheetRows: 302,
      });
      records = book.SheetNames.flatMap((name) =>
        importPromotionRows(XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '' })),
      );
    } else {
      const bytes = await file.arrayBuffer();
      let text = new TextDecoder().decode(bytes);
      if (text.includes('\ufffd')) text = new TextDecoder('gb18030').decode(bytes);
      records = importPromotionRows(parsePromotionFile(text));
    }
    if (roundId !== promotionRound) throw Error('轮次已切换，请重新导入');
    if (!records.length) throw Error('没有找到选手姓名');
    addPromotionEntries(records);
  });
  $('promotionSave').onclick = run(async () => {
    await savePromotion();
    notice('名单已保存');
  });
}
