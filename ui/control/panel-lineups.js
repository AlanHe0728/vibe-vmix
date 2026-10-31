/* ---------- 名单 ---------- */
/* 名单：主/客 × 首/替，按前缀写入并显示 */
function lineupAllShow() {
  return sendState({ lineup_mode: 'all', lineup_show: true, lineup_tick: nTick() });
}
function lineupAllWrite(show) {
  var patch = {};
  ['xiH', 'xiA', 'subH', 'subA'].forEach(function (pfx) {
    ['team', 'subtitle', 'color', 'players'].forEach(function (key) {
      patch[pfx + '_' + key] = $(pfx + '_' + key).value;
    });
  });
  if (show) {
    patch.lineup_mode = 'all';
    patch.lineup_show = true;
    patch.lineup_tick = nTick();
  }
  return sendState(patch);
}
function setMatchClock() {
  var mm = Number($('sb_clock_mm').value),
    ss = Number($('sb_clock_ss').value);
  if (!Number.isInteger(mm) || mm < 0 || mm > 9999 || !Number.isInteger(ss) || ss < 0 || ss > 59) {
    log('请输入 0–9999 分钟、0–59 秒', false);
    return;
  }
  return sendState({
    sb_clockmode: $('sb_clockmode').value,
    sb_clockacc: (mm * 60 + ss) * 1000,
    sb_clockcmd: 'set',
    sb_clock_tick: nTick(),
  });
}
function matchClockPreset(minutes) {
  $('sb_clock_mm').value = minutes;
  $('sb_clock_ss').value = '00';
  return setMatchClock();
}
function lineupWrite(pfx) {
  var o = {};
  o[pfx + '_team'] = $(pfx + '_team').value;
  o[pfx + '_subtitle'] = $(pfx + '_subtitle').value;
  o[pfx + '_color'] = $(pfx + '_color').value;
  o[pfx + '_players'] = $(pfx + '_players').value;
  o.lineup_mode = 'single';
  o.lineup_active = pfx;
  o.lineup_show = true;
  o.lineup_tick = nTick();
  sendState(o);
}
