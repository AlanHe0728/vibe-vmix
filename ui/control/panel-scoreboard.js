/* ---------- 比分条 ---------- */
function score(key, delta) {
  var el = $(key);
  var v = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
  el.value = v;
  var side = key === 'scoreHome' ? 'home' : 'away',
    draft = FBPLinks.isScoreDraft(side);
  FBPLinks.setScore(side, v);
  var o = {};
  o[draft ? key : key + '_delta'] = draft ? v : delta;
  var other = side === 'home' ? 'away' : 'home';
  if (FBPLinks.isScoreDraft(other))
    o[other === 'home' ? 'scoreHome' : 'scoreAway'] = $(
      other === 'home' ? 'scoreHome' : 'scoreAway',
    ).value;
  sendState(o);
}
var MATCH_STATUSES = { running: '进行中', paused: '暂停' };
function renderMatchStatus(status) {
  // Older presets and automatic phase transitions still use half/over.
  // Present both as paused without rewriting their saved phase or clock.
  if (status === 'half' || status === 'over') status = 'paused';
  if (!MATCH_STATUSES[status]) return;
  $('liveMatchStatus').textContent = MATCH_STATUSES[status];
  if (document.activeElement !== $('matchStatus')) $('matchStatus').value = status;
  document.querySelectorAll('[data-match-status]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.matchStatus === status));
  });
}
function setPeriod(period) {
  return sendState({ period: period });
}
function setStatus(s) {
  if (!MATCH_STATUSES[s]) return;
  return sendState({
    status: s,
    sb_clockcmd: s === 'running' ? 'start' : 'pause',
    sb_clock_tick: nTick(),
  });
}
function writeScoreboard() {
  sendState({
    teamHome: $('teamHome').value,
    teamAway: $('teamAway').value,
    scoreHome: $('scoreHome').value,
    scoreAway: $('scoreAway').value,
    period: $('period').value,
    colorHome: $('colorHome').value,
    colorAway: $('colorAway').value,
    ...FBPLinks.teamPatch(),
  });
}
var SAVED_SB_LOGOS = true;
function setScoreboardLogos(show) {
  $('sb_logos_show').disabled = true;
  return sendState({ sb_logos_show: !!show }).then(function (res) {
    if (res) SAVED_SB_LOGOS = !!show;
    $('sb_logos_show').checked = SAVED_SB_LOGOS;
    $('sb_logos_show').disabled = false;
  });
}

/* ---------- 计时器 ---------- */
function writeClock() {
  sendState({
    clock_label: $('clock_label').value,
    clock_sub: $('clock_sub').value,
    clock_mode: $('clock_mode').value,
    clock_mm: $('clock_mm').value,
    clock_ss: $('clock_ss').value,
    clock_color: $('clock_color').value,
    clock_cmd: 'set',
    clock_tick: nTick(),
  });
}
/* 计时器：正计/倒计 统一控制（自动显示计时器） */
function clockCmd(cmd) {
  sendState({ clock_cmd: cmd, clock_tick: nTick(), clock_show: true });
}
function clockSet() {
  sendState({
    clock_label: $('clock_label').value,
    clock_sub: $('clock_sub').value,
    clock_color: $('clock_color').value,
    clock_mode: $('clock_mode').value,
    clock_mm: $('clock_mm').value,
    clock_ss: $('clock_ss').value,
    clock_cmd: 'set',
    clock_tick: nTick(),
    clock_show: true,
  });
}
