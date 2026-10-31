// Automatic halves and late XI selection use temporary data/ports only.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const timing=require('../control/match-timing'),clocks=require('../control/clock-state'),title=require('../control/player-title'),format=require('../control/roster-format'),XLSX=require('../control/vendor/xlsx.full.min'),{CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
function seed(mode='up',period='上半场',resume=true){return {period,status:'running',match_timing:{enabled:true,halfMinutes:1,breakMinutes:1,autoResume:resume},sb_clock_state:{mode,running:true,accMs:mode==='up'?59000:1000,base:1000}};}
function unit(){
  for(const mode of ['up','down']){
    const input=seed(mode);assert.equal(timing.advance(input,1999),null);const half=timing.advance(input,2000);assert.equal(half.period,'中场休息');assert.equal(half.sb_clock_state.running,false);assert.equal(half.match_break_until,62000);assert.equal(input.period,'上半场');
    const second=timing.advance(half,62000);assert.equal(second.period,'下半场');assert.equal(second.sb_clock_state.accMs,60000);assert.equal(second.sb_clock_state.base,62000);
    assert.equal(timing.advance(second,121999),null);const end=timing.advance(second,122000);assert.equal(end.period,'比赛结束');assert.equal(end.sb_clock_state.running,false);assert.equal(end.sb_clock_state.accMs,mode==='up'?120000:0);
    assert.equal(timing.advance(input,999999).period,'比赛结束','Restart catches up using exact phase anchors');
    const paused=clocks.merge(half,{sb_clockcmd:'pause'},3000);assert.equal(paused.match_break_until,0);assert.equal(timing.advance(paused,999999),null,'Manual pause cancels pending auto resume');
    assert.equal(clocks.merge(half,{period:'中场休息',scoreHome:1},3000).match_break_until,62000,'Unchanged phase on a score edit retains the break timer');
    assert.equal(clocks.merge(half,{match_timing:{...half.match_timing,breakMinutes:2}},3000).match_break_until,122000,'Changing break duration retains the elapsed break time');
    assert.equal(clocks.merge(half,{sb_clockcmd:'start'},3000).period,'下半场','D200 start also advances out of halftime');
  }
  assert.equal(timing.advance(seed('up','上半场',false),2000).match_break_until,0);
  const direct=seed();direct.match_timing.breakMinutes=0;assert.equal(timing.advance(direct,2000).period,'下半场');
  assert.equal(timing.advance({...seed(),match_timing:{enabled:false}},999999),null);assert.throws(()=>timing.settings({halfMinutes:0}));
  assert.equal(title.get({player_event:'进球'}),'球员信息');assert.equal(title.get({player_event:'最佳球员'}),'最佳球员');assert.equal(title.get({player_title:'进球'}),'进球');
  console.log('PASS up/down half boundaries, break/resume/end anchors, restart catch-up, manual override, D200 start, settings validation and legacy/custom player titles');
}
async function backend(kind,temp){
  let server;
  try{
    for(const [mode,period,resume,expected] of [['up','上半场',false,'中场休息'],['up','上半场',true,'下半场'],['down','下半场',true,'比赛结束']]){
      const file=path.join(temp,kind+'-'+mode+'-'+expected+'.json'),s=seed(mode,period,resume);s.match_timing.breakMinutes=0;s.sb_clock_state.base=Date.now()+1300;s.sb_clock_state.accMs=mode==='up'?59700:300;fs.writeFileSync(file,JSON.stringify(s));server=await startServer(kind,file);
      await delay(1900);assert.equal(JSON.parse(fs.readFileSync(file)).period,expected,'Server advances with no control page or polling client');
      const r=await fetch(server.base+'/api/d200/status'),body=await r.json();assert.equal(body.controls.period,expected);assert.equal(body.controls.timing_version,1);
      await stop(server.child);server=null;
    }
    console.log('PASS '+kind+' automatic transitions persist with every page closed');
  }finally{if(server)await stop(server.child);}
}
const people=(count,label)=>Array.from({length:count},(_,i)=>(i+1)+' '+label+(i+1)+(i===0?' (GK)':'')+(i===9?' (C)':'')).join('\n');
async function main(){
  unit();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-match-desk-')),profile=path.join(temp,'edge');let browser,cdp,server;
  const real=path.resolve(__dirname,'../control/state.json'),original=fs.existsSync(real)?fs.readFileSync(real):null;
  try{
    await backend('node',temp);if(process.platform==='win32')await backend('powershell',temp);
    const allHome=people(26,'主球员').split('\n'),allAway=people(20,'客球员').split('\n');
    const file=path.join(temp,'ui.json');fs.writeFileSync(file,JSON.stringify({teamHome:'测试主队',teamAway:'测试客队',scoreHome:2,scoreAway:1,period:'上半场',player_event:'进球',xiH_players:allHome.slice(0,11).join('\n'),subH_players:allHome.slice(11).join('\n'),xiA_players:allAway.slice(0,11).join('\n'),subA_players:allAway.slice(11).join('\n')}));server=await startServer('node',file);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--disable-background-timer-throttling','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    const panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"$('squad_home_rows').querySelectorAll('.squad-row').length===26");
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);
    async function click(selector,scroll=true){if(scroll)await cdp.eval(panel,`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const point=await cdp.eval(panel,`(()=>{var b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,e=document.elementFromPoint(x,y);if(!e||(!b.contains(e)&&!e.contains(b)))throw Error('Obscured '+${JSON.stringify(selector)}+' y='+y);return {x,y};})()`);for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);}
    for(const tab of ['match','events','lineups','appearance','devices']){
      await cdp.eval(panel,`selectPanelTab('${tab}',true);window.scrollTo(0,document.body.scrollHeight)`);await click('#topClockToggle',false);await cdp.until(panel,"!$('topClockToggle').disabled&&$('topClockToggle').getAttribute('aria-pressed')==='true'");assert(JSON.parse(fs.readFileSync(file)).sb_clock_state.running);await click('#topClockToggle',false);await cdp.until(panel,"!$('topClockToggle').disabled&&$('topClockToggle').getAttribute('aria-pressed')==='false'");assert(!JSON.parse(fs.readFileSync(file)).sb_clock_state.running);
    }
    await cdp.eval(panel,"selectPanelTab('lineups',true)");const before=fs.readFileSync(file,'utf8'),writes=cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.method==='POST').length;
    await click('#squad_home_clear');const selected=[1,7,10,12,13,14,15,16,17,18,26],started=Date.now();
    for(const number of selected)await click('#squad_home_rows [data-player="home|'+number+'|主球员'+number+'"]');
    assert(Date.now()-started<60000);assert.equal(await cdp.eval(panel,"$('xiH_players').value.split(String.fromCharCode(10)).filter(Boolean).length"),11);assert.equal(fs.readFileSync(file,'utf8'),before,'Selecting XI only changes drafts');assert.equal(cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.method==='POST').length,writes);
    assert(await cdp.eval(panel,"$('xiH_players').value.includes('(GK)')&&$('xiH_players').value.includes('(C)')"));
    await cdp.eval(panel,"window.realFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return realFetch(url,opt);};");await click('#squadSave');await cdp.until(panel,"$('squadStatus').textContent.startsWith('保存失败')");assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),11);await cdp.eval(panel,'window.fetch=realFetch');
    await click('#squadSave');await cdp.until(panel,"$('squadStatus').textContent.startsWith('双方首发与替补已保存')");let state=JSON.parse(fs.readFileSync(file));assert.deepEqual(state.onfield_home,selected.map(n=>'home|'+n+'|主球员'+n));assert.equal(format.text(state.subH_players).count,15);
    await click('#squad_home_rows [data-player="home|26|主球员26"]');await click('#squad_home_restore');assert(await cdp.eval(panel,"$('squad_home_rows').querySelector('[data-player=\"home|26|主球员26\"] input').checked"));
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['号码','姓名','位置','队长'],[1,'新门将','GK','是'],[2,'新后卫','后卫','否']]),'新报名表');const encoded=XLSX.write(book,{type:'base64',bookType:'xlsx'});
    await cdp.eval(panel,`(()=>{var dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0))],'总名单.xlsx'));$('squad_home_file').files=dt.files;$('squad_home_file').dispatchEvent(new Event('change',{bubbles:true}));})()`);await cdp.until(panel,"$('squad_home_rows').querySelectorAll('.squad-row').length===2");assert(await cdp.eval(panel,"$('subH_players').value.includes('新门将 (GK) (C)')"));assert.equal(JSON.parse(fs.readFileSync(file)).xiH_players,state.xiH_players);
    await cdp.eval(panel,'fetchState()');await cdp.until(panel,"$('squad_home_rows').querySelectorAll('.squad-row').length===26");
    const viewer=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(viewer,"S.teamHome==='测试主队'");await cdp.eval(panel,"selectPanelTab('events',true);$('player_num').value='7';$('player_num').dispatchEvent(new Event('input',{bubbles:true}));writePlayer();WRITE_QUEUE");await cdp.until(viewer,"$('plyEv').textContent==='球员信息'&&$('ply').classList.contains('on')");assert(await cdp.eval(viewer,"$('ply').querySelector('.dot').hidden"));
    await cdp.eval(panel,"$('player_event').value='最佳球员';writePlayer();WRITE_QUEUE");await cdp.until(viewer,"$('plyEv').textContent==='最佳球员'");
    await click('#topClockSettingsButton',false);await cdp.eval(panel,"$('matchAutoEnabled').checked=true;$('matchHalfMinutes').value='40';$('matchHalfMinutes').dispatchEvent(new Event('input',{bubbles:true}));$('matchBreakMinutes').value='10';");await cdp.eval(panel,'FBPMatchTiming.save()');assert.equal(JSON.parse(fs.readFileSync(file)).match_timing.halfMinutes,40);
    const shotDir=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(shotDir,{recursive:true});await cdp.eval(panel,'window.scrollTo(0,0)');await delay(200);let shot=await cdp.send('Page.captureScreenshot',{format:'png'},panel);fs.writeFileSync(path.join(shotDir,'control-match-time.png'),Buffer.from(shot.data,'base64'));
    await cdp.eval(panel,"FBPMatchTiming.toggle();selectPanelTab('lineups',true);$('squadPicker').scrollIntoView({block:'start'})");await cdp.eval(panel,'window.scrollBy(0,-250)');await delay(200);shot=await cdp.send('Page.captureScreenshot',{format:'png'},panel);fs.writeFileSync(path.join(shotDir,'control-starting-picker.png'),Buffer.from(shot.data,'base64'));
    await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('squad_home_rows').querySelectorAll('input:checked').length===11");assert.equal(await cdp.eval(panel,"$('matchHalfMinutes').value"),'40');assert.equal(await cdp.eval(panel,"$('player_event').value"),'最佳球员');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:620,height:900,deviceScaleFactor:1,mobile:false},panel);await cdp.eval(panel,"selectPanelTab('lineups',true);window.scrollTo(0,document.body.scrollHeight)");assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'));await click('#topClockToggle',false);await cdp.until(panel,"!$('topClockToggle').disabled&&$('topClockToggle').getAttribute('aria-pressed')==='true'");await click('#topClockToggle',false);
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);assert.deepEqual(fs.existsSync(real)?fs.readFileSync(real):null,original);console.log('PASS sticky clocks in all tabs, real-pointer 11-player draft selection, failed/successful saves, role preservation, total Excel imports, corrected/custom player titles, settings persistence and mobile layout');
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);await delay(300);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-match-desk-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
