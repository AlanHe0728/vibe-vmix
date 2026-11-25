'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const version = require('../package.json').version;
const executable = path.resolve(
  __dirname,
  '../dist',
  '转播包装工作台-' + version + '-Windows-x64',
  '转播包装工作台.exe',
);
if (!fs.existsSync(executable)) {
  console.error(
    '请先执行 npm run build:workspace 构建 Windows 桌面程序，或直接使用已解压的发行包。',
  );
  process.exitCode = 1;
} else {
  const processHandle = spawn(executable, [], {
    cwd: path.dirname(executable),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  processHandle.once('error', (error) => {
    console.error('启动失败：' + error.message);
    process.exitCode = 1;
  });
  processHandle.unref();
}
