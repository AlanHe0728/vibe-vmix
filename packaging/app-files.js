'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_DIRECTORIES = ['core', 'server', 'modules', 'packages', 'ui', 'control', 'titles'];
const ASSET_EXTENSION = /\.(html|js|css|svg|png|jpe?g|webp|ico|woff2?|ttf|otf)$/i;

function runtimeFiles(root) {
  const result = [];
  for (const directory of RUNTIME_DIRECTORIES) {
    const base = path.join(root, directory);
    for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      const relative = path.relative(root, file).replaceAll(path.sep, '/');
      if (relative === 'control/assets/console-background.jpg') continue;
      const config = relative.startsWith('packages/') && entry.name.endsWith('.json');
      const catalog = relative === 'modules/football/d200-actions.json';
      if (ASSET_EXTENSION.test(entry.name) || config || catalog) result.push(relative);
    }
  }
  return result.sort();
}

function copyRuntime(root, destination) {
  for (const relative of runtimeFiles(root)) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (relative === 'ui/control/glass-theme.css') {
      const css = fs
        .readFileSync(source, 'utf8')
        .replace(
          'linear-gradient(#ffffff66,#ffffff66),url("assets/console-background.jpg") center/cover fixed',
          'linear-gradient(145deg,#edf1f6,#dfe5ec)',
        );
      fs.writeFileSync(target, css, 'utf8');
    } else fs.copyFileSync(source, target);
  }
}

module.exports = { runtimeFiles, copyRuntime };
