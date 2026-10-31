'use strict';

const { command, value } = require('../../core/clock');

function text(input, label, max = 200) {
  if (typeof input !== 'string' || input.length > max) throw Error('Invalid ' + label);
  return input.trim();
}

/** @returns {import('../../core/module-contract').BroadcastModule} */
function createStageModule() {
  function migrate(saved, now) {
    return {
      title: '',
      subtitle: '',
      visible: false,
      cue: 0,
      timer: { accMs: 0, base: now, running: false, mode: 'down' },
      ...saved,
    };
  }

  function reduce(current, patch, now) {
    const allowed = ['title', 'subtitle', 'visible', 'take', 'timerCommand', 'durationMs'];
    if (Object.keys(patch).some((key) => !allowed.includes(key)))
      throw Error('Unknown stage field');
    const next = { ...current };
    for (const key of ['title', 'subtitle']) {
      if (Object.hasOwn(patch, key)) next[key] = text(patch[key], key);
    }
    if (Object.hasOwn(patch, 'visible')) {
      if (typeof patch.visible !== 'boolean') throw Error('Invalid visibility');
      next.visible = patch.visible;
    }
    if (Object.hasOwn(patch, 'take')) {
      if (patch.take !== true) throw Error('Invalid cue');
      next.cue = Math.max(now, current.cue + 1);
    }
    if (Object.hasOwn(patch, 'timerCommand')) {
      next.timer = command(current.timer, patch.timerCommand, now, {
        accMs: patch.durationMs,
        mode: 'down',
      });
    } else if (Object.hasOwn(patch, 'durationMs')) throw Error('Duration requires timerCommand');
    return next;
  }

  return {
    id: 'stage',
    name: '舞台节目包装示例',
    capabilities: ['lower-third', 'cue', 'timer'],
    migrate,
    reduce,
    status: (state, now) => ({
      title: state.title,
      subtitle: state.subtitle,
      visible: state.visible,
      cue: state.cue,
      timer: { ...state.timer, milliseconds: value(state.timer, now) },
    }),
    pause: (state, now) =>
      state.timer.running ? reduce(state, { timerCommand: 'pause' }, now) : null,
    commands: [
      {
        id: 'title.show',
        label: '显示节目条',
        execute: (state, payload) => {
          if (Object.keys(payload).some((key) => !['title', 'subtitle'].includes(key)))
            throw Error('Unknown title field');
          return { ...payload, visible: true, take: true };
        },
      },
      { id: 'title.hide', label: '隐藏节目条', execute: () => ({ visible: false }) },
      {
        id: 'timer.set',
        label: '设置倒计时',
        execute: (state, payload) => ({ timerCommand: 'set', durationMs: payload.durationMs }),
      },
      { id: 'timer.start', label: '开始倒计时', execute: () => ({ timerCommand: 'start' }) },
      { id: 'timer.pause', label: '暂停倒计时', execute: () => ({ timerCommand: 'pause' }) },
    ],
  };
}

module.exports = { createStageModule };
