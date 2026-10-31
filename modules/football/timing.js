// Server-owned phase transitions. No browser timer is allowed to write clocks.
'use strict';
function settings(value) {
  value = value || {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid match timing settings');
  const result = { enabled: false, halfMinutes: 45, breakMinutes: 15, autoResume: true };
  for (const key of ['enabled', 'autoResume'])
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw Error('Invalid ' + key);
      result[key] = value[key];
    }
  for (const [key, min, max] of [
    ['halfMinutes', 1, 180],
    ['breakMinutes', 0, 120],
  ])
    if (value[key] !== undefined) {
      const n = Number(value[key]);
      if (!Number.isInteger(n) || n < min || n > max)
        throw Error(key + ' must be ' + min + '–' + max);
      result[key] = n;
    }
  return result;
}
function reconcile(state, patch, current, now) {
  if (Object.hasOwn(patch, 'match_timing')) state.match_timing = settings(patch.match_timing);
  if (
    ['sb_clockcmd', 'match_timing', 'match_timing_suspend'].some((k) => Object.hasOwn(patch, k)) ||
    ['period', 'status'].some((k) => Object.hasOwn(patch, k) && patch[k] !== current[k])
  )
    state.match_break_until = 0;
  if (
    Object.hasOwn(patch, 'match_timing') &&
    state.period === '中场休息' &&
    !state.sb_clock_state.running
  ) {
    const cfg = state.match_timing,
      start =
        current.match_break_until > 0
          ? current.match_break_until - settings(current.match_timing).breakMinutes * 60000
          : now;
    state.match_break_until = cfg.enabled && cfg.autoResume ? start + cfg.breakMinutes * 60000 : 0;
  }
}
function advance(state, now = Date.now()) {
  const cfg = settings(state.match_timing);
  if (!cfg.enabled) return null;
  let next = state,
    changed = false;
  const half = cfg.halfMinutes * 60000;
  function update(period, status, ms, base, running, deadline) {
    next = {
      ...next,
      period,
      status,
      match_break_until: deadline || 0,
      sb_clockacc: ms,
      sb_clockrun: running ? 1 : 0,
      sb_clock_state: { ...next.sb_clock_state, accMs: ms, base, running },
    };
    changed = true;
  }
  // Catch up at exact anchors after a server restart without drifting durations.
  for (let i = 0; i < 3; i++) {
    const c = next.sb_clock_state,
      period = next.period || '上半场';
    if (!c) break;
    if (period === '中场休息' && next.match_break_until > 0 && now >= next.match_break_until) {
      update('下半场', 'running', half, next.match_break_until, true, 0);
      continue;
    }
    if (!c.running || !['上半场', '下半场'].includes(period)) break;
    const target = c.mode === 'down' ? 0 : period === '上半场' ? half : half * 2;
    const remaining = c.mode === 'down' ? c.accMs : target - c.accMs,
      due = c.base + Math.max(0, remaining);
    if (now < due) break;
    if (period === '上半场')
      update(
        '中场休息',
        'half',
        target,
        due,
        false,
        cfg.autoResume ? due + cfg.breakMinutes * 60000 : 0,
      );
    else update('比赛结束', 'over', target, due, false, 0);
  }
  return changed ? next : null;
}
module.exports = { settings, reconcile, advance };
