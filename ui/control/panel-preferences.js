/* ---------- 本地记忆（服务器地址/预设等） ---------- */
function persist(key, val) {
  try {
    if (val === undefined || val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch (e) {}
}
function initPersist() {
  try {
    var sb = localStorage.getItem('fbp_serverBase');
    if (!/^https?:$/.test(location.protocol) && sb) serverBase = sb;
    $('serverBase').value = serverBase;
    var va = localStorage.getItem('fbp_vmixApi');
    if (va) $('vmixApi').value = va;
    var oi = localStorage.getItem('fbp_overlayInput');
    if (oi) $('overlayInput').value = oi;
    var gs = localStorage.getItem('fbp_goal_side');
    if (gs) $('goal_side').value = gs;
    $('goal_sync').checked = false;
  } catch (e) {}
}

/* ---------- 赛事预设 ---------- */
var PRESETS = {};
var PRESET_KEYS = [
  'teamHome',
  'teamAway',
  'scoreHome',
  'scoreAway',
  'period',
  'colorHome',
  'colorAway',
];
function refreshPresetSelect() {
  var s = $('presetSelect'),
    names = Object.keys(PRESETS);
  s.innerHTML = names
    .map(function (n) {
      return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>';
    })
    .join('');
  if (!names.length) s.innerHTML = '<option value="">— 暂无预设 —</option>';
}
function savePreset() {
  var name = $('presetName').value.trim();
  if (!name) {
    log('请先填写预设名', false);
    return;
  }
  var o = {};
  PRESET_KEYS.forEach(function (k) {
    o[k] = $(k).value;
  });
  PRESETS[name] = o;
  sendState({ _presets: PRESETS }).then(function (res) {
    if (!res) return;
    refreshPresetSelect();
    log('已保存预设: ' + name, true);
  });
}
function loadPreset() {
  var name = $('presetSelect').value,
    p = PRESETS[name];
  if (!p) {
    log('未选择预设', false);
    return;
  }
  var patch = {};
  PRESET_KEYS.forEach(function (k) {
    if (p[k] !== undefined) patch[k] = p[k];
  });
  sendState(patch).then(function (res) {
    if (!res) return;
    fetchState();
    log('已载入预设: ' + name, true);
  });
}
function deletePreset() {
  var name = $('presetSelect').value;
  if (!name || !PRESETS[name]) {
    log('未选择预设', false);
    return;
  }
  delete PRESETS[name];
  sendState({ _presets: PRESETS }).then(function (res) {
    if (!res) return;
    refreshPresetSelect();
    log('已删除预设: ' + name, true);
  });
}
