'use strict';

const awardDrafts = new Map();
const awardChoices = new Map();
let selectedAwardId = '';
let awardBusy = false;
let awardRosterSignature;

function syncAwardRoster() {
  const seen = new Set();
  const groups = [];
  function addGroup(label, candidates) {
    const names = [];
    for (const candidate of candidates) {
      const name = candidate.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    if (names.length) groups.push([label, names]);
  }
  const rounds = new Map(roundOptions());
  for (const roster of state.promotions) {
    addGroup(rounds.get(roster.id) || '未分轮', roster.entries.map((entry) => entry.name));
  }
  addGroup('节目单演出者', state.programs.map((program) => program.performer));

  const signature = JSON.stringify(groups);
  if (signature === awardRosterSignature) return;
  awardRosterSignature = signature;
  const picker = $('awardRosterPicker');
  const hint = seen.size ? '选择姓名…' : '名单为空，可手动填写';
  picker.replaceChildren(new Option(hint, ''));
  for (const [label, names] of groups) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const name of names) group.append(new Option(name, name));
    picker.append(group);
  }
}

function selectedAward() {
  return state?.awards?.find(({ awardId }) => awardId === selectedAwardId);
}

function awardChoiceTitle({ awardId, title }) {
  if (awardId === 'teacher-1') return title + '（教师 1）';
  if (awardId === 'teacher-2') return title + '（教师 2）';
  return title;
}

function fillAwardEditor(award) {
  const draft = awardDrafts.get(award.awardId);
  $('awardRecipient').value = draft?.recipient ?? award.recipient;
  $('awardHoldSeconds').value = draft?.holdInput ?? award.holdSeconds;
}

function awardEditorValues() {
  return {
    recipient: $('awardRecipient').value.trim(),
    holdSeconds: $('awardHoldSeconds').valueAsNumber,
  };
}

function awardDraftConflict(award) {
  const baseline = awardDrafts.get(award.awardId)?.baseline;
  return (
    baseline &&
    (baseline.recipient !== award.recipient || baseline.holdSeconds !== award.holdSeconds)
  );
}

function syncAwardEditor() {
  const award = selectedAward();
  $('awardEditor').hidden = !award;
  if (!award) {
    updateDockAwardPreview(null);
    return;
  }
  const onAir = state.awardOnAir;
  const dirty = awardDrafts.has(award.awardId);
  const conflict = awardDraftConflict(award);
  const { recipient, holdSeconds } = awardEditorValues();
  const nameInput = $('awardRecipient');
  nameInput.disabled = awardBusy;
  const tooLong = recipient.length > nameInput.maxLength;
  nameInput.setCustomValidity(tooLong ? '获奖人姓名最多 40 字，请编辑播出用名' : '');
  $('awardRosterPicker').disabled = awardBusy || $('awardRosterPicker').options.length <= 1;
  $('awardHoldSeconds').disabled = awardBusy;
  const valid = !tooLong && $('awardHoldSeconds').validity.valid;
  const playing = Boolean(dockAwardPlayback);
  $('awardSelectedTitle').textContent = awardChoiceTitle(award);
  $('awardSave').disabled = awardBusy || !dirty || !valid || conflict;
  $('awardRestore').hidden = !dirty;
  $('awardRestore').disabled = awardBusy;
  $('awardTake').disabled =
    awardBusy || !canTake() || !recipient || !valid || Boolean(onAir) || conflict;
  $('awardPreview').disabled = awardBusy || !valid || !recipient;
  $('awardPreview').textContent = playing ? '重新预演' : '预演';
  $('awardStopPreview').disabled = !playing;
  const status = [];
  if (tooLong) status.push(nameInput.validationMessage);
  if (conflict) status.push('该奖项已在其他窗口修改，请恢复已保存设置后再编辑');
  else if (dirty) status.push('未保存');
  else status.push(recipient ? '已保存' : '填写获奖人后可预演或上屏');
  if (playing) status.push(dockAwardPlayback.startedAt ? '预演中' : '等待预览页');
  if (collaboration?.session.active && !collaboration.session.owns)
    status.push('播出控制权已交接');
  $('awardEditorStatus').textContent = status.join(' · ');
  const { awardId, title } = award;
  updateDockAwardPreview({
    awardId,
    title,
    recipient: recipient || '获奖人',
    holdSeconds: valid ? holdSeconds : award.holdSeconds,
  });
}

function renderAwardChoices(awards, onAir) {
  const list = $('awardChoices');
  for (const award of awards) {
    const { awardId } = award;
    let choice = awardChoices.get(awardId);
    if (!choice) {
      choice = document.createElement('button');
      choice.type = 'button';
      const title = document.createElement('strong');
      const details = document.createElement('span');
      const live = document.createElement('span');
      details.className = 'award-choice-details';
      live.className = 'award-choice-live';
      choice.append(title, details, live);
      choice.onclick = () => {
        selectedAwardId = awardId;
        fillAwardEditor(selectedAward());
        syncAwards();
      };
      awardChoices.set(awardId, choice);
      list.append(choice);
    }
    const [title, details, live] = choice.children;
    const draft = awardDrafts.get(awardId);
    const recipient = draft?.recipient.trim() ?? award.recipient;
    title.textContent = awardChoiceTitle(award);
    details.textContent = (recipient || '未填写获奖人') + (draft ? ' · 未保存' : '');
    live.textContent = onAir?.awardId === awardId ? (onAir.exitAt ? '退场中' : '播出中') : '';
    choice.setAttribute('aria-pressed', String(awardId === selectedAwardId));
    choice.disabled = awardBusy;
  }
}

function syncAwards() {
  const awards = state?.awards ?? [];
  const onAir = state?.awardOnAir;
  if (!selectedAward()) selectedAwardId = awards[0]?.awardId || '';
  const award = selectedAward();
  if (award && !awardDrafts.has(award.awardId)) fillAwardEditor(award);
  renderAwardChoices(awards, onAir);
  const status = $('awardOutputStatus');
  status.dataset.air = String(Boolean(onAir));
  status.textContent = onAir
    ? `${onAir.exitAt ? '退场中' : '播出中'} · ${awardChoiceTitle(onAir)} · ${onAir.recipient}`
    : '已下屏';
  $('awardHide').disabled = awardBusy || !canTake() || !onAir || Boolean(onAir.exitAt);
  syncAwardEditor();
}

function changedAward() {
  const award = selectedAward();
  const { recipient, holdSeconds } = awardEditorValues();
  if (recipient === award.recipient && holdSeconds === award.holdSeconds) {
    awardDrafts.delete(award.awardId);
  } else {
    awardDrafts.set(award.awardId, {
      baseline: awardDrafts.get(award.awardId)?.baseline ?? award,
      recipient: $('awardRecipient').value,
      holdInput: $('awardHoldSeconds').value,
    });
  }
  renderAwardChoices(state.awards, state.awardOnAir);
  syncAwardEditor();
}

async function commitAward(action) {
  if (awardBusy) return;
  const award = selectedAward();
  if (!award || awardDraftConflict(award)) throw Error('请恢复最新的已保存设置');
  if (!$('awardEditor').reportValidity()) return;
  const updated = { ...award, ...awardEditorValues() };
  if (action === 'take' && !updated.recipient) throw Error('请填写获奖人');
  awardBusy = true;
  syncAwards();
  try {
    if (action === 'save') {
      await write({
        awards: state.awards.map((entry) => entry.awardId === award.awardId ? updated : entry),
      });
      notice('已保存' + awardChoiceTitle(award) + '设置');
    } else {
      const { awardId, recipient, holdSeconds } = updated;
      await command(
        'award.take',
        { awardId, recipient, holdSeconds },
        etag ? { 'If-Match': etag } : {},
      );
    }
    awardDrafts.delete(award.awardId);
  } finally {
    awardBusy = false;
    syncAwards();
  }
}

function switchStagePackaging(mode) {
  const award = mode === 'award';
  $('awardDesk').hidden = !award;
  $('promotionDesk').hidden = award;
  document.querySelectorAll('[data-packaging-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.packagingMode === mode));
  });
  usePackagingSidePreview(mode);
}

function installAwards() {
  document.querySelectorAll('[data-packaging-mode]').forEach((button) => {
    button.onclick = () => switchStagePackaging(button.dataset.packagingMode);
  });
  $('awardRecipient').oninput = $('awardHoldSeconds').oninput = changedAward;
  $('awardRosterPicker').onchange = () => {
    const picker = $('awardRosterPicker');
    if (!picker.value) return;
    $('awardRecipient').value = picker.value;
    picker.value = '';
    changedAward();
  };
  $('awardEditor').onsubmit = run(() => commitAward('save'));
  $('awardTake').onclick = run(() => commitAward('take'));
  $('awardRestore').onclick = () => {
    awardDrafts.delete(selectedAwardId);
    syncAwards();
  };
  $('awardPreview').onclick = run(() => {
    const { awardId, title } = selectedAward();
    playDockAwardPreview({ awardId, title, ...awardEditorValues() });
  });
  $('awardStopPreview').onclick = () => stopDockAwardPreview();
  $('awardHide').onclick = run(async () => {
    if (awardBusy) return;
    awardBusy = true;
    syncAwards();
    try {
      await command('award.hide');
    } finally {
      awardBusy = false;
      syncAwards();
    }
  });
}
