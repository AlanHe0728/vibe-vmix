// Real Chromium UI regression tests using Edge's local DevTools protocol.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {startServer,stop,delay}=require('./regression');
class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.events=[];
    ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);
      if(msg.id){const p=this.pending.get(msg.id);if(p){this.pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}
      else this.events.push(msg);
    });
  }
  send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},10000);
    this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,sessionId}));
  });}
  async page(url){const {targetId}=await this.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
    await this.send('Runtime.enable',{},sessionId);await this.send('Network.enable',{},sessionId);await this.send('Page.enable',{},sessionId);
    await this.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false},sessionId);
    await this.send('Page.navigate',{url},sessionId);return sessionId;
  }
  async eval(sessionId,expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
  }
  async until(id,expression){for(let i=0;i<60;i++){try{if(await this.eval(id,expression))return;}catch(_){}await delay(100);}throw Error('UI timeout: '+expression);}
}
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-browser-'));
  const stateFile=path.join(temp,'state.json'),profile=path.join(temp,'edge');
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==';
  fs.writeFileSync(stateFile,JSON.stringify({teamHome:'测试主队',teamAway:'测试客队',scoreHome:0,scoreAway:0,
    scoreboard_show:true,sb_pos:{x:800,y:300},sb_scale:1.2,posreset_tick:5,
    sb_clockacc:45000,sb_clockrun:1,sb_clockcmd:'minus',sb_clock_tick:8,
    clock_mode:'down',clock_mm:2,clock_run:1,clock_show:true,clock_tick:16,clock_cmd:'reset',
    goal_tick:9,goal_trigger:'goal',card_tick:10,card_trigger:'red',player_tick:11,restart_tick:12,
    lineup_mode:'single',lineup_active:'xiH',lineup_show:true,xiH_team:'测试主队',xiH_players:'1 张三\n2 李四 (C)',theme_bg:pixel}));
  let server,browser,cdp;
  try {
    server=await startServer('node',stateFile);
    const edge=process.env.FBP_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);
    if(!fs.existsSync(active))throw Error('Headless Edge did not start');
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);
    const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    cdp=new CDP(ws);
    const a=await cdp.page(server.base+'/titles/graphics.html');
    const b=await cdp.page(server.base+'/titles/graphics.html');
    for(const p of [a,b])await cdp.until(p,"S.teamHome==='测试主队' && CC.running");
    const snapshot=fs.readFileSync(stateFile,'utf8');await delay(1300);
    assert.equal(fs.readFileSync(stateFile,'utf8'),snapshot);
    for(const p of [a,b]){
      await cdp.send('Page.bringToFront',{},p);
      await cdp.until(p,"Number(getComputedStyle($('lineupList').firstChild).opacity)>.99");
      assert.deepEqual(await cdp.eval(p,"['goal','card','rst','ply'].map(function(id){return $(id).classList.contains('on');})"),[false,false,false,false]);
      assert.equal(await cdp.eval(p,"$('sb').style.left"),'800px');
      assert(await cdp.eval(p,"getComputedStyle(document.body).backgroundImage.indexOf('data:image/png')>=0"));
      assert.equal(await cdp.eval(p,"$('lineupList').children.length"),2);
      assert(Number(await cdp.eval(p,"getComputedStyle($('lineupList').firstChild).opacity"))>.99);
    }
    const va=await cdp.eval(a,'ckMs()'),vb=await cdp.eval(b,'ckMs()');assert(Math.abs(va-vb)<100);assert(va<119000);
    assert.equal(cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.method==='POST').length,0);
    console.log('PASS two viewers stay synchronized, no clock writes, historical events ignored, saved positions, background image, lineup visibility');
    const panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"$('connDot').classList.contains('ok')");
    assert.equal(await cdp.eval(panel,'serverBase'),server.base);
    assert.equal(await cdp.eval(panel,"$('singleUrl').value"),server.base+'/titles/graphics.html');
    await cdp.eval(panel,"score('scoreHome',-1); WRITE_QUEUE");
    assert.equal((await (await fetch(server.base+'/state.json')).json()).scoreHome,0);
    // Quick scoring stays silent across panel and viewer reloads.
    await cdp.eval(panel,"quickScore('home');WRITE_QUEUE");await cdp.until(a,"S.scoreHome===1");
    await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('scoreHome').value==='1' && $('connDot').classList.contains('ok')");
    assert(!await cdp.eval(a,"$('goal').classList.contains('on')"),'Top score-only action does not replay a goal');
    await cdp.eval(panel,"quickScore('home');WRITE_QUEUE");await cdp.until(a,'S.scoreHome===2');
    await cdp.send('Page.reload',{},a);await cdp.until(a,'S.scoreHome===2');
    assert.equal(await cdp.eval(a,"$('goal').classList.contains('on')"),false);
    assert.equal(await cdp.eval(a,"$('sb').style.left"),'800px');
    console.log('PASS custom port, nonnegative silent scoring across panel reloads, viewer refresh without replay/reset');
    const editor=await cdp.page(server.base+'/titles/graphics.html?edit=1');await cdp.until(editor,"S.scoreHome===2 && !!scSlider");
    await cdp.eval(editor,"selectEl('sb');scSlider.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scSlider.value='1.73';scSlider.dispatchEvent(new Event('input',{bubbles:true}));");
    await delay(700);
    assert.equal(await cdp.eval(editor,"DRAG.sb"),true);
    // Force an old snapshot through applyPos to exercise protection independent of unchanged ETag.
    assert.equal(await cdp.eval(editor,"applyPos('sb','sb');$('sb').style.transform"),'translate(-50%, -50%) scale(1.73)');
    await cdp.eval(editor,"scSlider.dispatchEvent(new Event('change',{bubbles:true}));");
    await cdp.until(editor,"S.sb_scale===1.73 && !DRAG.sb && !PENDING.sb");
    await cdp.send('Page.reload',{},editor);await cdp.until(editor,'S.sb_scale===1.73');
    assert.equal(await cdp.eval(editor,"$('sb').style.transform"),'translate(-50%, -50%) scale(1.73)');
    console.log('PASS slider protection, save acknowledgement, scale survives reload');
    // Drag via actual browser input, then release and reload.
    const point=await cdp.eval(editor,"(function(){var r=$('sb').getBoundingClientRect();for(var x=Math.max(10,r.x+30);x<Math.min(innerWidth-50,r.right);x+=50){var y=r.y+r.height/2;var e=document.elementFromPoint(x,y);if(e&&e.closest('.pos')&&e.closest('.pos').id==='sb')return {x:x,y:y};}throw Error('No exposed scoreboard drag point');})()");
    for(const [type,x,y,button,buttons] of [['mousePressed',point.x,point.y,'left',1],['mouseMoved',point.x+40,point.y+25,'left',1],['mouseReleased',point.x+40,point.y+25,'left',0]]) {
      await cdp.send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1},editor);
    }
    await cdp.until(editor,'S.sb_pos.x===840 && S.sb_pos.y===325');
    await cdp.send('Page.reload',{},editor);await cdp.until(editor,'S.sb_pos.x===840');
    assert.equal(await cdp.eval(editor,"$('sb').style.left"),'840px');
    const preview=await cdp.page(server.base+'/control/preview.html');await cdp.until(preview,"$('frame').contentWindow.S && $('frame').contentWindow.S.scoreHome===2");
    assert.equal(await cdp.eval(preview,"getComputedStyle($('banner')).display"),'none');
    assert.equal(await cdp.eval(preview,"$('frame').contentWindow.STATE_URL"),server.base+'/state.json');
    console.log('PASS pointer drag and reload, preview at custom port, hidden connection banner');
    // Prepare text without triggering an on-air event, then operate through the D200 API.
    const oldCardTick=(await (await fetch(server.base+'/state.json')).json()).card_tick;
    await cdp.eval(panel,"$('card_name').value='判罚测试球员';$('card_num').value='17';prepareD200('card');WRITE_QUEUE");
    let state=await (await fetch(server.base+'/state.json')).json();
    assert.equal(state.card_name,'判罚测试球员');assert.equal(state.card_tick,oldCardTick);
    const d200=await cdp.page(server.base+'/control/d200.html');await cdp.until(d200,"!!catalog && $('connection').textContent==='足球包装接口正常'");
    assert.equal(await cdp.eval(d200,"$('actions').children.length"),12);
    assert.equal(await cdp.eval(d200,"$('actionUrl').value"),server.base+'/api/d200/action/home_goal');
    assert.equal(await cdp.eval(d200,"$('statusUrl').value"),server.base+'/api/d200/status');
    await cdp.eval(d200,"$('execute').click();");await cdp.until(d200,"$('feedback').textContent==='已执行：主队进球（自动加分）'");
    await cdp.until(panel,"$('scoreHome').value==='3'");await cdp.until(a,"S.scoreHome===3 && $('goal').classList.contains('on')");
    await cdp.eval(d200,"$('filter').value='all';render();");assert.equal(await cdp.eval(d200,"$('actions').children.length"),44);
    await cdp.eval(d200,"pick(catalog.actions.find(function(a){return a.id==='sb_clock_toggle';}));");
    assert.equal(await cdp.eval(d200,"$('statusPath').value"),'buttons.sb_clock_toggle.active');
    await fetch(server.base+'/api/d200/action/hide_all',{method:'POST'});
    await cdp.until(a,"!$('goal').classList.contains('on') && !$('sb').classList.contains('on') && !$('lineup').classList.contains('on')");
    console.log('PASS D200 setup fields, 44 actions, content-only save, button-triggered goal, remote panel score sync, all graphics off');
    // Failed writes must never emit successful action messages.
    const before=await cdp.eval(panel,"logBox.textContent");
    await cdp.eval(panel,"serverBase=location.origin+'/missing';setVis('logo_show',true);WRITE_QUEUE");
    assert(await cdp.eval(panel,"$('writeStatus').textContent.indexOf('保存失败')===0"));
    const after=await cdp.eval(panel,'logBox.textContent');assert(!after.slice(before.length).includes('显示 logo_show'));
    console.log('PASS failed HTTP write surfaces error without false success');
    const errors=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(errors.length,0,JSON.stringify(errors));
  } catch(e) {console.error('Browser regression failed:',e);throw e;} finally {
    if(cdp){try{await cdp.send('Browser.close');}catch(_){}cdp.ws.close();}
    if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}
    if(server)await stop(server.child);
    if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup path');
    await delay(1000);
    try {fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});}
    catch(e){console.error('Temporary browser profile cleanup failed:',temp,e.message);}
  }
}
module.exports={CDP};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
