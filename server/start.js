'use strict';

const { spawn } = require('node:child_process');

function start(server, { port, name = '转播包装服务', page = '/control/panel.html' }) {
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? '端口 ' + port + ' 已被占用，请关闭原服务器或设置 PORT。'
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = 'http://localhost:' + server.address().port + page;
    console.log(name + '已启动: ' + url);
    if (process.env.FBP_NO_BROWSER === '1') return;
    const command =
      process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(command, args, { stdio: 'ignore', windowsHide: true }).on('error', () =>
      console.log('请手动打开: ' + url),
    );
  });
}

module.exports = { start };
