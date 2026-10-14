'use strict';
const fs = require('node:fs');
const path = require('node:path');
const clocks = require('../control/clock-state');

function pausedSnapshot(input, now = Date.now()) {
  // A release snapshot carries the current clock readings, never a running
  // anchor that would count the time spent copying the software to another PC.
  return clocks.merge(clocks.migrate(input,now),{sb_clockcmd:'pause',clock_cmd:'pause'},now);
}

function portableReleaseState(input, now = Date.now()) {
  const source = pausedSnapshot(input, now);
  // Shareable builds may retain a user font, but must never inherit match data.
  const clean = {};
  for (const key of ['font_data', 'font_family', 'theme_font']) {
    if (typeof source[key] === 'string' && source[key]) clean[key] = source[key];
  }
  return clean;
}

function prepareData(directory, seedFile) {
  fs.mkdirSync(directory,{recursive:true});
  // Fail before opening a window if the portable folder cannot retain edits.
  const probe = path.join(directory,'.write-test-'+process.pid);
  fs.writeFileSync(probe,''); fs.unlinkSync(probe);
  const stateFile = path.join(directory,'state.json');
  if (!fs.existsSync(stateFile)) {
    const seed = JSON.parse(fs.readFileSync(seedFile,'utf8').replace(/^\uFEFF/,''));
    fs.writeFileSync(stateFile,JSON.stringify(pausedSnapshot(seed),null,2),'utf8');
  }
  // Existing data is read and validated by createServer. Never replace it on
  // update, and never silently overwrite an unreadable match file.
  return stateFile;
}

async function listenPortable(server, preferredPort = 8123) {
  if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65535) {
    throw new Error('Invalid preferred port');
  }
  const ports = preferredPort === 0 ? [0] : [preferredPort,
    ...Array.from({length:20},(_,i)=>preferredPort+i+1).filter(p=>p<=65535),0];
  for (const port of ports) {
    try {
      await new Promise((resolve,reject)=>{
        const listening = () => { server.removeListener('error',error); resolve(); };
        const error = e => { server.removeListener('listening',listening); reject(e); };
        server.once('listening',listening); server.once('error',error);
        server.listen(port,'127.0.0.1');
      });
      return 'http://127.0.0.1:'+server.address().port;
    } catch (error) {
      if (!['EADDRINUSE','EACCES'].includes(error.code)) throw error;
    }
  }
  throw new Error('Cannot open a local control service');
}

module.exports = {pausedSnapshot,portableReleaseState,prepareData,listenPortable};
