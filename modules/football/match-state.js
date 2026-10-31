// Clock anchors are changed only by commands, never by rendering pages.
'use strict';
const { value, command: clockCommand } = require('../../core/clock');
const scores = require('../../core/score');
const timing = require('./timing');
function createMatchState({ positions: POSITIONS, roster: { applyRoster, migrateRoster } }) {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const nonnegative = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  function migrate(s, now = Date.now()) {
    s = { ...s };
    for (const prefix of ['sb_clock', 'clock']) {
      const key = prefix + '_state';
      if (
        s[key] &&
        typeof s[key] === 'object' &&
        Number.isFinite(s[key].accMs) &&
        Number.isFinite(s[key].base)
      )
        continue;
      s[key] = {
        mode: s[prefix + (prefix === 'clock' ? '_mode' : 'mode')] === 'down' ? 'down' : 'up',
        running: Number(s[prefix + (prefix === 'clock' ? '_run' : 'run')]) === 1,
        accMs:
          prefix === 'clock'
            ? (nonnegative(s.clock_mm ?? 15) * 60 + nonnegative(s.clock_ss)) * 1000
            : nonnegative(s.sb_clockacc),
        base: now,
      };
    }
    return migrateRoster(s);
  }
  function command(s, patch, prefix, now) {
    const key = prefix + '_state',
      cmdKey = prefix === 'clock' ? 'clock_cmd' : 'sb_clockcmd';
    if (!own(patch, cmdKey)) return;
    let cmd = patch[cmdKey];
    let c;
    if (
      prefix === 'sb_clock' &&
      (cmd === 'second' || (cmd === 'start' && s.period === '中场休息'))
    ) {
      c = {
        ...s[key],
        accMs: timing.settings(s.match_timing).halfMinutes * 60000,
        base: now,
        running: true,
      };
      s.period = '下半场';
      s.status = 'running';
    } else {
      const preset = {
        mode: s[prefix === 'clock' ? 'clock_mode' : 'sb_clockmode'],
        accMs:
          prefix === 'clock'
            ? (nonnegative(s.clock_mm) * 60 + nonnegative(s.clock_ss)) * 1000
            : nonnegative(s.sb_clockacc),
      };
      c = clockCommand(s[key], cmd, now, preset);
    }
    const ms = c.accMs;
    s[key] = c;
    if (prefix === 'clock') {
      s.clock_mode = c.mode;
      s.clock_run = c.running ? 1 : 0;
      s.clock_mm = Math.floor(ms / 60000);
      s.clock_ss = Math.floor(ms / 1000) % 60;
    } else {
      s.sb_clockmode = c.mode;
      s.sb_clockrun = c.running ? 1 : 0;
      s.sb_clockacc = ms;
    }
  }
  function merge(current, patch, now = Date.now()) {
    const s = migrate(current, now);
    for (const [key, v] of Object.entries(patch)) {
      if (
        [
          '__proto__',
          'constructor',
          'prototype',
          'clock_state',
          'sb_clock_state',
          'scoreHome_delta',
          'scoreAway_delta',
          'match_break_until',
          'match_timing_suspend',
        ].includes(key)
      )
        continue;
      // Unique events even across multiple control panels.
      s[key] = key.endsWith('_tick') ? Math.max(now, nonnegative(s[key]) + 1) : v;
    }
    for (const k of ['scoreHome', 'scoreAway', 'goal_scoreHome', 'goal_scoreAway']) {
      if (own(patch, k)) s[k] = scores.normalize(patch[k]);
    }
    for (const k of ['scoreHome', 'scoreAway']) {
      if (own(patch, k + '_delta')) {
        s[k] = scores.adjust(current[k], patch[k + '_delta']);
      }
    }
    if (
      ['scoreHome', 'scoreAway', 'scoreHome_delta', 'scoreAway_delta'].some((k) => own(patch, k))
    ) {
      s.goal_scoreHome = Math.floor(nonnegative(s.scoreHome));
      s.goal_scoreAway = Math.floor(nonnegative(s.scoreAway));
    }
    applyRoster(current, s, patch);
    command(s, patch, 'sb_clock', now);
    command(s, patch, 'clock', now);
    timing.reconcile(s, patch, current, now);
    if (own(patch, 'posreset_tick'))
      for (const [k, [x, y]] of Object.entries(POSITIONS)) {
        s[k + '_pos'] = { x, y };
        s[k + '_scale'] = 1;
      }
    return s;
  }
  return { migrate, merge, value };
}
module.exports = { createMatchState };
