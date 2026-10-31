'use strict';

const { createMatchState } = require('./match-state');
const { createRoster } = require('./roster');
const timing = require('./timing');
const { createActions } = require('./actions');

function createFootballModule(profile) {
  const roster = createRoster({ batchSubstitutions: profile.batchSubstitutions });
  const state = createMatchState({ positions: profile.positions, roster });
  const actions = createActions(roster);

  function pause(current, now) {
    const patch = {};
    if (current.match_break_until > 0) patch.match_timing_suspend = true;
    if (current.sb_clock_state.running) patch.sb_clockcmd = 'pause';
    if (current.clock_state.running) patch.clock_cmd = 'pause';
    return Object.keys(patch).length ? state.merge(current, patch, now) : null;
  }

  return {
    id: 'football',
    name: '足球赛事',
    capabilities: [
      'score',
      'match-clock',
      'timer',
      'roster',
      'graphics',
      ...(profile.batchSubstitutions ? ['batch-substitutions'] : []),
    ],
    migrate: state.migrate,
    reduce: state.merge,
    advance: timing.advance,
    pause,
    status: actions.status,
    legacyCatalog: actions.catalog,
    commands: actions.catalog.actions.map((action) => ({
      id: action.id,
      label: action.label || action.name || action.id,
      execute: (current) => actions.patchFor(action.id, current),
    })),
  };
}

module.exports = { createFootballModule };
