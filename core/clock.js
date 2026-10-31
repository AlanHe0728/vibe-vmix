'use strict';

// A clock is an anchor, not a value rewritten on every animation frame.
function value(clock, now = Date.now()) {
  const elapsed = clock.running ? Math.max(0, now - clock.base) : 0;
  return Math.max(0, clock.accMs + (clock.mode === 'down' ? -elapsed : elapsed));
}

function command(clock, action, now = Date.now(), preset = {}) {
  const next = { ...clock, accMs: value(clock, now), base: now };
  switch (action) {
    case 'start':
      next.running = true;
      break;
    case 'pause':
      next.running = false;
      break;
    case 'reset':
      next.accMs = 0;
      next.running = false;
      break;
    case 'plus':
      next.accMs += 60000;
      break;
    case 'minus':
      next.accMs = Math.max(0, next.accMs - 60000);
      break;
    case 'set':
      if (!Number.isFinite(preset.accMs) || preset.accMs < 0) throw Error('invalid clock duration');
      next.accMs = preset.accMs;
      next.mode = preset.mode === 'down' ? 'down' : 'up';
      next.running = false;
      break;
    case 'up':
    case 'down':
      next.mode = action;
      next.accMs = 0;
      next.running = false;
      break;
    default:
      throw Error('invalid clock command');
  }
  return next;
}

module.exports = { value, command };
