'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directories = [
  'core',
  'server',
  'modules',
  'ui',
  'control',
  'titles',
  'v2',
  'desktop',
  'packaging',
  'scripts',
  'examples',
  'ae-plugin',
];
let count = 0;

for (const directory of directories) {
  for (const entry of fs.readdirSync(path.join(root, directory), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (file.includes(path.sep + 'vendor' + path.sep)) continue;
    const result = spawnSync(process.execPath, ['--check', file], {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
    // Enforce dependency direction without adding a framework or lint runtime.
    if (directory === 'core' || directory === 'modules') {
      const source = fs.readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
      for (const specifier of imports) {
        if (directory === 'core' && specifier.startsWith('node:')) continue;
        if (specifier.startsWith('.')) {
          const target = path
            .relative(root, path.resolve(path.dirname(file), specifier))
            .replaceAll(path.sep, '/');
          const permitted =
            directory === 'core'
              ? ['core/']
              : ['core/', path.relative(root, file).split(path.sep).slice(0, 2).join('/') + '/'];
          if (permitted.some((prefix) => target.startsWith(prefix))) continue;
        }
        throw Error('Forbidden dependency: ' + path.relative(root, file) + ' -> ' + specifier);
      }
    }
  }
}
console.log('PASS syntax and core/module dependency boundaries (' + count + ' files)');
