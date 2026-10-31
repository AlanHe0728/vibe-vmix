'use strict';

const path = require('node:path');
const { createServer: createCoreServer } = require('./create-server');
const { createFootballModule } = require('../modules/football');

const project = path.resolve(__dirname, '..');

function createFootballServer(
  options = {},
  profile = require('../packages/football-classic.json'),
) {
  const root = path.resolve(options.root || project);
  const allowed = options.staticDirectories || ['control', 'titles'];
  const mounts = [];
  mounts.push({ prefix: '/shared/', directory: path.join(project, 'ui/shared') });
  if (allowed.includes('control'))
    mounts.push({
      prefix: '/control/',
      directory: path.join(project, 'modules/football'),
      files: ['roster-format.js', 'match-config.js', 'player-title.js', 'd200-actions.json'],
    });
  // Public UI is shared. Package-specific markup and animation override it.
  for (const directory of allowed) {
    if (!['control', 'titles'].includes(directory)) continue;
    mounts.push({ prefix: '/' + directory + '/', directory: path.join(project, 'ui', directory) });
    mounts.push({
      prefix: '/' + directory + '/',
      directory: path.join(root, directory),
      files:
        directory === 'control'
          ? ['panel.html', 'preview.html', 'v2-console.css', 'panel-batch-sub.js']
          : ['graphics.html', 'premier.css', 'premier.js'],
    });
    mounts.push({
      prefix: '/' + directory + '/assets/',
      directory: path.join(root, directory, 'assets'),
    });
  }
  const server = createCoreServer({
    module: createFootballModule(profile),
    stateFile: path.resolve(
      options.stateFile || process.env.FBP_STATE_FILE || path.join(root, 'control/state.json'),
    ),
    mounts,
    publicFiles: {
      '/package.js': {
        type: 'application/javascript; charset=utf-8',
        body: 'window.FBPPackage=' + JSON.stringify(profile) + ';',
      },
      ...(profile.id === 'football-premier'
        ? {
            '/version.json': {
              type: 'application/json; charset=utf-8',
              body: JSON.stringify({ version: 2 }),
            },
          }
        : {}),
    },
    landingPage: '/control/panel.html',
  });
  return server;
}

module.exports = { createFootballServer };
