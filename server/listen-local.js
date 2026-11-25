'use strict';

async function listenLocal(server, preferred = 0) {
  const ports = preferred ? [preferred, 0] : [0];
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const ready = () => {
          server.off('error', failed);
          resolve();
        };
        const failed = (error) => {
          server.off('listening', ready);
          reject(error);
        };
        server.once('error', failed).once('listening', ready).listen(port, '127.0.0.1');
      });
      return 'http://127.0.0.1:' + server.address().port;
    } catch (error) {
      if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
    }
  }
  throw Error('无法启动本地服务');
}

async function closeLocal(server) {
  server.pauseClocks?.();
  if (!server.listening) return;
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

module.exports = { listenLocal, closeLocal };
