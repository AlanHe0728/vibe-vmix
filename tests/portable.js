// Exercise the actual distributed EXE, using only a copied portable folder.
// Never open or write a real match file, browser profile, or port 8123.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {CDP}=require('./browser');
const {delay}=require('./regression');
const {createServer}=require('../control/serve');
const {prepareData,listenPortable,pausedSnapshot}=require('../desktop/portable-data');
const root=path.resolve(__dirname,'..');
const release=path.resolve(process.argv[2]||path.join(root,'dist','足球转播控制台-1.0.0-Windows-x64-candidate'));
const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
async function unit(temp) {
  const input={teamHome:'keep',font_data:'keep-font',sb_clock_state:{mode:'up',running:true,accMs:1000,base:1000}};
  const paused=pausedSnapshot(input,2000);assert.equal(paused.sb_clock_state.accMs,2000);assert.equal(paused.sb_clock_state.running,false);assert.equal(input.sb_clock_state.running,true);
  const data=path.join(temp,'unit'),seed=path.join(temp,'seed.json');fs.writeFileSync(seed,JSON.stringify(input));
  const file=prepareData(data,seed);fs.writeFileSync(file,'{"teamHome":"existing"}');prepareData(data,seed);
  assert.equal(JSON.parse(fs.readFileSync(file)).teamHome,'existing');
  fs.writeFileSync(file,'not JSON');prepareData(data,seed);assert.throws(()=>createServer({stateFile:file}));assert.equal(fs.readFileSync(file,'utf8'),'not JSON');
  console.log('PASS portable clock snapshot, existing-data preservation, corrupt-data preservation');
}
async function connect(folder,port) {
  const emptyPath=path.join(path.dirname(folder),'empty-path');fs.mkdirSync(emptyPath,{recursive:true});
  const env={...process.env,PATH:emptyPath,Path:emptyPath,FBP_PORTABLE_PORT:String(port),FBP_PORTABLE_TEST:'1'};
  delete env.ELECTRON_RUN_AS_NODE;delete env.FBP_PORTABLE_DATA;
  const child=spawn(path.join(folder,'足球转播控制台.exe'),['--inspect=0','--remote-debugging-port=0','--disable-background-networking'],
    {cwd:folder,windowsHide:true,env});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',e=>output+=e.stack);
  const active=path.join(folder,'data/browser/DevToolsActivePort');let cdp,base,panel;
  for(let i=0;i<150;i++) {
    if(child.exitCode!==null)throw Error('EXE exited '+child.exitCode+': '+output);
    if(fs.existsSync(active)) {
      try {
        const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);
        const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
        await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
        cdp=new CDP(ws);const {targetInfos}=await cdp.send('Target.getTargets');
        const target=targetInfos.find(t=>t.type==='page'&&t.url.endsWith('/control/panel.html'));
        if(target){base=new URL(target.url).origin;panel=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;break;}
        ws.close();cdp=null;
      } catch (_) {if(cdp)cdp.ws.close();cdp=null;}
    }
    await delay(100);
  }
  if(!cdp){child.kill();throw Error('Desktop EXE did not create a control window: '+output);}
  for(const method of ['Runtime.enable','Network.enable','Page.enable'])await cdp.send(method,{},panel);
  await cdp.until(panel,"$('connDot').classList.contains('ok')");
  return {child,cdp,base,panel,env,folder,output:()=>output};
}
async function quit(app) {
  const exit=app.child.exitCode!==null?Promise.resolve():once(app.child,'exit');
  // Close the native BrowserWindow, exactly as pressing the title-bar X.
  // Chromium Page.close closes a debugging target, not Electron's window.
  const endpoint=app.output().match(/Debugger listening on (ws:\/\/\S+)/)?.[1];
  assert(endpoint,'Main-process inspector available for native-window test');
  const ws=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const inspector=new CDP(ws);
  const result=await inspector.send('Runtime.evaluate',{expression:`process.getBuiltinModule('module').createRequire(process.execPath)('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/control/panel.html')).close()`});
  assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));ws.close();
  const timeout=delay(8000).then(()=>{if(app.child.exitCode===null) {
    throw Error('EXE failed to quit cleanly: '+app.output());
  }});
  await Promise.race([exit,timeout]);app.cdp.ws.close();
  assert.notEqual(app.child.exitCode,null);
  await assert.rejects(()=>fetch(app.base+'/state.json'),'Local service must stop on exit');
}
async function openPage(app,url) {
  await app.cdp.eval(app.panel,'window.open('+JSON.stringify(url)+',"_blank")');
  for(let i=0;i<100;i++) {
    const {targetInfos}=await app.cdp.send('Target.getTargets');
    const target=targetInfos.find(t=>t.type==='page'&&t.url===url);
    if(target) {
      const {sessionId}=await app.cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      for(const method of ['Runtime.enable','Network.enable','Page.enable'])await app.cdp.send(method,{},sessionId);
      return sessionId;
    }
    await delay(100);
  }
  throw Error('Native child window did not open: '+url);
}
async function main() {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-portable-'));
  const stateHash=hash(fs.readFileSync(path.join(root,'control/state.json')));
  let app,blocker;
  try {
    await unit(temp);
    const folder=path.join(temp,'另一台电脑 中文 空格','足球转播控制台');fs.mkdirSync(path.dirname(folder),{recursive:true});
    fs.cpSync(release,folder,{recursive:true});
    const seed=JSON.parse(fs.readFileSync(path.join(folder,'resources/app/desktop/seed-state.json')));
    // Simulate an empty first-run data directory, in this test copy only.
    const copiedData=path.resolve(folder,'data');assert(copiedData.startsWith(path.resolve(temp)+path.sep));fs.rmSync(copiedData,{recursive:true,force:true});
    blocker=net.createServer(socket=>socket.end('occupied by another application'));
    blocker.listen(0,'127.0.0.1');await once(blocker,'listening');const occupied=blocker.address().port;
    app=await connect(folder,occupied);assert.notEqual(Number(new URL(app.base).port),occupied);
    const {cdp,panel,base}=app;
    let saved=await(await fetch(base+'/state.json')).json();
    for(const key of ['teamHome','teamAway','homeLogo','awayLogo','logo_data','font_data','xiH_players','subH_players'])assert.equal(saved[key],seed[key]);
    assert.equal(saved.sb_clock_state.running,false);assert.equal(saved.clock_state.running,false);
    assert.equal(await cdp.eval(panel,"$('singleUrl').value"),base+'/titles/graphics.html');
    assert.deepEqual(await cdp.eval(panel,"[typeof require,typeof window.process,typeof XLSX.read,typeof FBPAssets.hydrate]"),['undefined','undefined','function','function']);
    await cdp.eval(panel,"localStorage.setItem('fbp_portable_test','saved choice')");
    const first=await fetch(base+'/state.json'),etag=first.headers.get('etag');await first.arrayBuffer();
    assert.equal((await fetch(base+'/state.json',{headers:{'If-None-Match':etag}})).status,304);
    for(const url of ['/control/vendor/xlsx.full.min.js','/control/vendor/motion.js','/titles/motion-curves.js','/titles/assets/icons/football.svg']) {
      const result=await fetch(base+url);assert.equal(result.status,200);await result.arrayBuffer();
    }
    assert.equal((await fetch(base+'/desktop/seed-state.json')).status,404);
    console.log('PASS real EXE with empty PATH, Chinese/spaced path, first-run seed/assets/fonts, no Node in renderer, ETag, local dependencies, automatic occupied-port fallback');
    // A second double-click focuses the running instance instead of creating
    // another server or replacing its saved data.
    const second=spawn(path.join(folder,'足球转播控制台.exe'),[],{cwd:folder,windowsHide:true,env:app.env,stdio:'ignore'});
    await Promise.race([once(second,'exit'),delay(7000).then(()=>{if(second.exitCode===null){second.kill();throw Error('Single-instance lock failed');}})]);
    assert.equal(second.exitCode,0);assert(blocker.listening);
    const viewer=await openPage(app,base+'/titles/graphics.html');await cdp.until(viewer,'!!S.teamHome');
    await cdp.eval(panel,"$('teamHome').value='便携测试队';$('teamHome').dispatchEvent(new Event('change',{bubbles:true}));WRITE_QUEUE");
    await cdp.until(viewer,"S.teamHome==='便携测试队'");
    await cdp.eval(panel,'quickGoal("home");WRITE_QUEUE');await cdp.until(viewer,`S.scoreHome===${Number(seed.scoreHome||0)+1} && $('goal').classList.contains('on')`);
    saved=JSON.parse(fs.readFileSync(path.join(folder,'data/state.json')));assert.equal(saved.teamHome,'便携测试队');
    const book=await cdp.eval(panel,"(()=>{var b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['号码','姓名'],[10,'测试前锋'],[1,'测试门将']]),'主队');return XLSX.write(b,{type:'base64',bookType:'xlsx'});})()");
    await cdp.eval(panel,`(()=>{var bytes=Uint8Array.from(atob(${JSON.stringify(book)}),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'便携导入.xlsx'));$('xiH_import').files=dt.files;$('xiH_import').dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.until(panel,"$('xiH_players').value==='10 测试前锋'+String.fromCharCode(10)+'1 测试门将'");
    await cdp.eval(panel,'lineupAllWrite(false);WRITE_QUEUE');
    await cdp.eval(panel,'editorOpen()');
    let preview;
    for(let i=0;i<80&&!preview;i++) {const {targetInfos}=await cdp.send('Target.getTargets');preview=targetInfos.find(t=>t.url===base+'/control/preview.html');if(!preview)await delay(100);}
    assert(preview,'Preview opens as a native app window');
    const previewSession=(await cdp.send('Target.attachToTarget',{targetId:preview.targetId,flatten:true})).sessionId;
    await cdp.until(previewSession,"document.querySelector('iframe')&&document.querySelector('iframe').contentDocument.querySelector('#sb')");
    await cdp.eval(panel,'trigger("sb_clockcmd","start");WRITE_QUEUE');
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'data/state.json'))).sb_clock_state.running,true);
    console.log('PASS single instance, team-name sync, goal animation, Excel import, native preview window, persisted edits');
    // Reload while listening for all page requests, so no packaged resource
    // can silently rely on a developer server or CDN.
    cdp.events=[];await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('connDot').classList.contains('ok')");
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
    assert.equal(cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)&&new URL(e.params.request.url).origin!==base).length,0,'No external UI dependency');
    const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'},panel);
    fs.mkdirSync(path.join(root,'docs/screenshots'),{recursive:true});fs.writeFileSync(path.join(root,'docs/screenshots/portable-desktop.png'),Buffer.from(screenshot.data,'base64'));
    await quit(app);app=null;assert(blocker.listening);
    saved=JSON.parse(fs.readFileSync(path.join(folder,'data/state.json')));assert.equal(saved.sb_clock_state.running,false);
    const moved=path.join(temp,'搬到新目录','足球转播 便携');fs.mkdirSync(path.dirname(moved),{recursive:true});fs.renameSync(folder,moved);
    app=await connect(moved,occupied);
    assert.equal(await app.cdp.eval(app.panel,"$('teamHome').value"),'便携测试队');
    assert.equal(await app.cdp.eval(app.panel,"localStorage.getItem('fbp_portable_test')"),'saved choice');
    assert.equal(await app.cdp.eval(app.panel,"$('xiH_players').value"),'10 测试前锋\n1 测试门将');
    saved=await(await fetch(app.base+'/state.json')).json();assert.equal(saved.font_data,seed.font_data);assert.equal(saved.homeLogo,seed.homeLogo);
    await quit(app);app=null;
    console.log('PASS offline local UI, quit pauses clocks/stops service, folder relocation, persisted match/roster/images/font/browser settings');
    assert.equal(hash(fs.readFileSync(path.join(root,'control/state.json'))),stateHash,'Real match data is untouched');
  } finally {
    if(app){await app.cdp.send('Browser.close').catch(()=>{});app.cdp.ws.close();if(app.child.exitCode===null)app.child.kill();await delay(1500);}
    if(blocker?.listening)await new Promise(resolve=>blocker.close(resolve));
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-portable-'))throw Error('Unsafe cleanup');
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
