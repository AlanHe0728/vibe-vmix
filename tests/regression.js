// Isolated HTTP and clock regression tests. Never write control/state.json.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {migrate,merge,value} = require('../control/clock-state');
const root = path.resolve(__dirname,'..');
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function stop(child) {
  if(child.exitCode!==null)return;
  const done=once(child,'exit'); child.kill(); await done;
}
function unit() {
  let s=migrate({clock_mode:'down',clock_mm:2,sb_clockacc:120000,posreset_tick:7,sb_pos:{x:700,y:300},logo_data:'keep'},1000);
  assert.deepEqual(s.sb_pos,{x:700,y:300}); // Historical reset is not executed on migration.
  s=merge(s,{clock_cmd:'start',clock_tick:1},2000);
  assert.equal(value(s.clock_state,3500),118500);
  const tag=s.clock_tick;
  s=merge(s,{clock_cmd:'pause',clock_tick:1},4000);
  assert.equal(s.clock_state.accMs,118000);assert(s.clock_tick>tag);
  assert.equal(value(s.clock_state,9000),118000);
  s=merge(s,{clock_cmd:'plus'},5000);assert.equal(s.clock_state.accMs,178000);
  s=merge(s,{clock_cmd:'set',clock_mode:'up',clock_mm:1,clock_ss:3},6000);
  s=merge(s,{clock_cmd:'start'},7000);assert.equal(value(s.clock_state,10000),66000);
  s=merge(s,{sb_clockcmd:'start'},11000);assert.equal(value(s.sb_clock_state,14000),123000);
  s=merge(s,{sb_clockcmd:'pause'},15000);assert.equal(s.sb_clock_state.accMs,124000);
  s=merge(s,{clock_cmd:'reset',scoreHome:-1,posreset_tick:1},16000);
  assert.equal(s.scoreHome,0);assert.equal(s.clock_state.accMs,0);
  assert.deepEqual(s.sb_pos,{x:423,y:96});assert.equal(s.logo_data,'keep');
  assert.equal(migrate(s,99999).sb_clock_state.base,s.sb_clock_state.base);
  console.log('PASS clock commands, elapsed time, restart, unique ticks, historical reset, score clamp');
}
async function sparePort(){const s=net.createServer();s.listen(0);await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function startServer(kind,file) {
  const port=await sparePort();
  const child=spawn(kind==='node'?process.execPath:'powershell',kind==='node'?[path.join(root,'control/serve.js')]:['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'control/serve.ps1')],
    {cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),FBP_NO_BROWSER:'1',FBP_STATE_FILE:file}});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  child.on('error',e=>output+=e.message);
  const base='http://localhost:'+port;
  for(let i=0;i<80;i++) {
    if(child.exitCode!==null)throw Error(kind+' exited: '+output);
    // Drain the readiness response: HttpListener writes synchronously, so a large
    // upload fixture must not leave the server waiting on an unread HTTP body.
    try { const r=await fetch(base+'/state.json');if(r.ok){await r.arrayBuffer();return {child,base};} } catch(_){}
    await delay(100);
  }
  await stop(child);throw Error(kind+' did not start: '+output);
}
async function httpSuite(kind,temp) {
  const file=path.join(temp,kind+'.json');
  fs.writeFileSync(file,JSON.stringify({teamHome:'主队',logo_data:'preserve',sb_pos:{x:900,y:700},posreset_tick:3,clock_mode:'down',clock_mm:1,clock_ss:0,clock_tick:2,clock_cmd:'minus'}));
  let server=await startServer(kind,file);
  try {
    const {base}=server;
    const rootResponse=await fetch(base+'/',{redirect:'manual'});assert.equal(rootResponse.status,302);assert.equal(rootResponse.headers.get('location'),'/control/panel.html');
    for(const p of ['/control/panel.html','/control/preview.html','/titles/graphics.html','/titles/runtime.js'])assert.equal((await fetch(base+p)).status,200);
    let r=await fetch(base+'/state.json'),s=await r.json(),etag=r.headers.get('etag');
    assert.deepEqual(s.sb_pos,{x:900,y:700});assert.equal(s.clock_state.accMs,60000);
    assert.equal((await fetch(base+'/state.json',{headers:{'If-None-Match':etag}})).status,304);
    const post=async p=>{const r=await fetch(base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).ok,true);};
    await post({teamHome:'中文主队 ⚽',scoreHome:-1,clock_cmd:'set',clock_tick:1,clock_mm:1,clock_mode:'down'});
    s=await (await fetch(base+'/state.json')).json();assert.equal(s.teamHome,'中文主队 ⚽');assert.equal(s.scoreHome,0);assert.equal(s.logo_data,'preserve');
    await post({clock_cmd:'start',clock_tick:1});
    r=await fetch(base+'/state.json');s=await r.json();etag=r.headers.get('etag');
    await delay(1100);assert.equal((await fetch(base+'/state.json',{headers:{'If-None-Match':etag}})).status,304);assert(value(s.clock_state,Date.now())<59500);
    await post({clock_cmd:'pause',clock_tick:1});s=await (await fetch(base+'/state.json')).json();assert(s.clock_state.accMs<59500);assert.equal(s.clock_state.running,false);
    await post({sb_clockcmd:'set',sb_clockmode:'down',sb_clockacc:2730000,sb_clock_tick:1});s=await (await fetch(base+'/state.json')).json();assert.equal(s.sb_clock_state.accMs,2730000);assert.equal(s.sb_clock_state.running,false);assert.equal(s.sb_clock_state.mode,'down');
    await post({sb_clockcmd:'start'});await delay(50);s=await (await fetch(base+'/state.json')).json();assert(value(s.sb_clock_state,Date.now())<2730000);
    await post({sb_clockcmd:'pause'});
    const bytes=fs.readFileSync(file);assert.equal(JSON.parse(bytes).teamHome,'中文主队 ⚽');
    // Force an atomic-save failure in this isolated fixture; state and ETag must not change.
    fs.renameSync(file,file+'.saved');fs.mkdirSync(file);
    r=await fetch(base+'/state.json');etag=r.headers.get('etag');
    const failure=await fetch(base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamHome:'must not save'})});
    assert.equal(failure.status,500);assert.equal((await failure.json()).ok,false);
    assert.equal((await fetch(base+'/state.json',{headers:{'If-None-Match':etag}})).status,304);
    fs.rmdirSync(file);fs.renameSync(file+'.saved',file);
    assert.equal((await fetch(base+'/state.json',{method:'POST',body:'[]'})).status,400);
    await post({posreset_tick:1});s=await (await fetch(base+'/state.json')).json();assert.deepEqual(s.sb_pos,{x:423,y:96});assert.deepEqual(s.lineup_all_pos,{x:960,y:580});
    await stop(server.child);server=await startServer(kind,file);
    s=await (await fetch(server.base+'/state.json')).json();assert.equal(s.clock_state.running,false);assert.equal(s.teamHome,'中文主队 ⚽');
    console.log('PASS '+kind+' HTTP 200/302/304, Chinese JSON, commands, persistence, save-failure rollback, restart');
  } finally {await stop(server.child);}
}
async function main(){
  unit();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-regression-'));
  try {await httpSuite('node',temp);if(process.platform==='win32')await httpSuite('powershell',temp);}
  finally {if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup path');fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={startServer,stop,delay};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
