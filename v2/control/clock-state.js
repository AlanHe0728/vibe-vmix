'use strict';
const { createMatchState } = require('../../modules/football/match-state');
const { createRoster } = require('../../modules/football/roster');
const profile = require('../../packages/football-premier.json');
module.exports = createMatchState({ positions: profile.positions, roster: createRoster(profile) });
