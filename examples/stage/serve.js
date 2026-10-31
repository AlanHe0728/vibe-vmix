'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('../../server/create-server');
const { start } = require('../../server/start');
const { createStageModule } = require('./module');

if (require.main === module) {
  const data = path.resolve(process.env.FBP_STAGE_DATA || path.join(__dirname, 'data'));
  fs.mkdirSync(data, { recursive: true });
  const server = createServer({
    module: createStageModule(),
    stateFile: path.join(data, 'state.json'),
  });
  start(server, {
    port: Number(process.env.PORT || 8125),
    name: '舞台 API 示例',
    page: '/api/v1/module',
  });
}
