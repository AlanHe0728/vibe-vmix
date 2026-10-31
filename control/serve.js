'use strict';
const path = require('node:path');
const { createFootballServer } = require('../server/football-server');
const { start } = require('../server/start');
const profile = require('../packages/football-classic.json');
function createServer(options = {}) {
  return createFootballServer({ root: path.resolve(__dirname, '..'), ...options }, profile);
}
module.exports = { createServer };
if (require.main === module)
  start(createServer(), { port: Number(process.env.PORT || profile.port), name: profile.name });
