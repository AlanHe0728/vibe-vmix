'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ui = process.argv.includes('--ui');
if (ui) fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
const suites = ui
  ? [
      'browser',
      'links',
      'features',
      'event-controls',
      'match-configs',
      'imports',
      'roster-editor',
      'match-desk',
      'v2',
    ]
  : ['regression', 'd200'];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!ui) run(['--test', 'tests/core.test.js']);
for (const suite of suites) run(['tests/' + suite + '.js']);
