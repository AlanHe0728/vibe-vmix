'use strict';
const path = require('node:path');
const { createWorkspaceServer } = require('./workspace-server');
const { listenLocal } = require('./listen-local');
const args = process.argv.slice(2);
async function main() {
  const dataDirectory = path.resolve(args[0] || path.join(__dirname, '../data'));
  const server = createWorkspaceServer({ dataDirectory });
  await server.initialize();
  const origin = await listenLocal(server, Number(process.env.PORT || 8120));
  console.log(JSON.stringify({ origin, pid: process.pid }));
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await server.shutdown();
    process.exit(0);
  }
  process.on('SIGINT', stop).on('SIGTERM', stop);
  // The native host owns this pipe. A crash or normal exit both release services.
  if (process.env.BROADCAST_DESKTOP === '1') {
    process.stdin.resume();
    process.stdin.on('end', stop).on('data', (data) => {
      if (data.toString().includes('quit')) stop();
    });
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
