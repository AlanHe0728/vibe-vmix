const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
const fixture={teamHome:'主队甲',teamAway:'客队乙',colorHome:'#c8102e',colorAway:'#00529f',scoreHome:2,scoreAway:1,
  xiH_players:'10 主十 (C)\n7 主七',subH_players:'12 主十二\n10 场外十',xiA_players:'10 客十\n7 客七',subA_players:'12 客十二',goal_side:'home',goal_num:'10',goal_name:'主十'};
async function backend(kind,temp){
  const file=path.join(temp,kind+'.json');fs.writeFileSync(file,JSON.stringify(fixture));const server=await startServer(kind,file);
  const post=async patch=>fetch(server.base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
  try{
    let r=await post({scoreHome:5,scoreAway:4});assert.equal(r.status,200);let s=await (await fetch(server.base+'/state.json')).json();assert.equal(s.goal_scoreHome,5);assert.equal(s.goal_scoreAway,4);
    await post({scoreAway_delta:1});s=await (await fetch(server.base+'/state.json')).json();assert.equal(s.goal_scoreAway,5);assert.equal(s.goal_tick,undefined);
    const patch={sub_side:'home',sub_off_id:'home|10|主十',sub_on_id:'home|12|主十二',sub_trigger:'show',sub_tick:1};
    const responses=await Promise.all([post(patch),post(patch)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,400],'Duplicate concurrent substitutions execute once');
    const body=await responses.find(r=>r.status===200).json();assert(body.onfield.home.includes('home|12|主十二'),'POST acknowledgement includes committed on-field identities');assert.equal(body.controls.status,'running');
    s=await (await fetch(server.base+'/state.json')).json();assert(s.onfield_home.includes('home|12|主十二'));assert(!s.onfield_home.includes('home|10|主十'));assert.equal(s.sub_off_name,'主十');assert.equal(s.sub_on_name,'主十二');
    const snapshot=fs.readFileSync(file,'utf8');assert.equal((await post({...patch,sub_off_id:'away|10|客十'})).status,400);assert.equal(fs.readFileSync(file,'utf8'),snapshot,'Invalid opposing-team substitution cannot change state');
    await post({xiH_players:'7 主七\n12 主十二'});s=await (await fetch(server.base+'/api/d200/status')).json();assert.deepEqual(s.onfield.home,['home|7|主七','home|12|主十二']);assert(s.onfield.away.includes('away|10|客十'));
    console.log('PASS '+kind+' linked score storage, silent score edits, atomic substitutions, replay rejection, team isolation and roster reset');
  }finally{await stop(server.child);}
}
async function legacyBackend(kind,temp){
  const file=path.join(temp,kind+'-legacy.json'),old={...fixture,sub_side:'home',sub_off_id:'home|10|主十',sub_on_id:'home|12|主十二',sub_trigger:'show',sub_tick:100};fs.writeFileSync(file,JSON.stringify(old));const before=fs.readFileSync(file,'utf8'),server=await startServer(kind,file);
  try{const s=await(await fetch(server.base+'/state.json')).json();assert(s.onfield_home.includes(old.sub_on_id));assert(!s.onfield_home.includes(old.sub_off_id));assert.equal(s.sub_tick,100);assert.equal(s.xiH_players,fixture.xiH_players);assert.equal(fs.readFileSync(file,'utf8'),before,'Migration reads old title data without writing real match data or replaying a title');const r=await fetch(server.base+'/api/d200/action/sub_show',{method:'POST'});assert.equal(r.status,400);console.log('PASS '+kind+' recorded legacy substitution recovery without replay or file writes');}finally{await stop(server.child);}
}
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-links-')),profile=path.join(temp,'edge'),file=path.join(temp,'browser.json');let server,browser,cdp;
  try{
    await backend('node',temp);if(process.platform==='win32')await backend('powershell',temp);
    await legacyBackend('node',temp);if(process.platform==='win32')await legacyBackend('powershell',temp);
    fs.writeFileSync(file,JSON.stringify(fixture));server=await startServer('node',file);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    const panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"$('goal_roster_player').options.length===5");const snapshot=fs.readFileSync(file,'utf8');
    async function input(id,value,event='input'){await cdp.eval(panel,`$('${id}').value=${JSON.stringify(value)};$('${id}').dispatchEvent(new Event('${event}',{bubbles:true}));`);}
    await input('scoreHome','7');assert.equal(await cdp.eval(panel,"$('goal_scoreHome').value"),'7');await input('goal_scoreAway','3');assert.equal(await cdp.eval(panel,"$('scoreAway').value"),'3');
    await delay(1200);assert.equal(await cdp.eval(panel,"$('goal_scoreHome').value"),'7','Polling preserves unsaved score drafts');
    for(const prefix of ['goal','card','player','restart']){
      await input(prefix+'_side','home','change');await input(prefix+'_num','010');assert.equal(await cdp.eval(panel,`$('${prefix}_name').value`),'主十','Manual number uses active player before bench duplicate');
      await input(prefix+'_side','away','change');assert.equal(await cdp.eval(panel,`$('${prefix}_name').value`),'客十','Same number resolves within selected team');assert.equal(await cdp.eval(panel,`$('${prefix}_team').value`),'客队乙');
      await input(prefix+'_num','99');assert.equal(await cdp.eval(panel,`$('${prefix}_name').value`),'','Unknown number clears stale automatic player');
      await input(prefix+'_name','手动球员');await input(prefix+'_num','98');assert.equal(await cdp.eval(panel,`$('${prefix}_name').value`),'手动球员');
      await input(prefix+'_roster_player','away|12|客十二','change');assert.equal(await cdp.eval(panel,`$('${prefix}_num').value`),'12');assert.equal(await cdp.eval(panel,`$('${prefix}_name').value`),'客十二');
      assert.deepEqual(await cdp.eval(panel,`Array.from($('${prefix}_roster_player').querySelectorAll('optgroup')).map(e=>e.label)`),['场内球员','场外球员']);
    }
    await input('teamAway','新客队');await input('colorAway','#123456');assert.deepEqual(await cdp.eval(panel,"[$('goal_team').value,$('goal_color').value,$('xiA_team').value,$('subA_team').value,$('player_team').value]"),['新客队','#123456','新客队','新客队','新客队']);
    await input('xiH_players','10 主十\n10 另一个场内十\n7 主七');await input('goal_side','home','change');await input('goal_num','10');assert(await cdp.eval(panel,"$('goal_match_hint').textContent.includes('多名')"));
    // The native file import uses FileReader, not a mock parsing callback.
    await cdp.eval(panel,"const dt=new DataTransfer();dt.items.add(new File(['号码,姓名'+String.fromCharCode(10)+'10,主十 (C)'+String.fromCharCode(10)+'7,主七'],'roster.csv',{type:'text/csv'}));$('xiH_import').files=dt.files;$('xiH_import').dispatchEvent(new Event('change',{bubbles:true}));");
    await cdp.until(panel,"$('xiH_players').value==='10 主十 (C)'+String.fromCharCode(10)+'7 主七'");assert.equal(await cdp.eval(panel,"$('goal_name').value"),'主十');
    assert.equal(fs.readFileSync(file,'utf8'),snapshot,'Linked drafts and imports do not write match state');
    await cdp.eval(panel,'writeScoreboard();WRITE_QUEUE');let s=JSON.parse(fs.readFileSync(file));assert.equal(s.scoreHome,7);assert.equal(s.goal_scoreHome,7);assert.equal(s.goal_scoreAway,3);assert.equal(s.goal_team,'主队甲');
    await input('scoreHome','9');await input('goal_scoreAway','4');await cdp.eval(panel,"score('scoreHome',1);WRITE_QUEUE");s=JSON.parse(fs.readFileSync(file));assert.equal(s.scoreHome,10);assert.equal(s.scoreAway,4);assert.equal(s.goal_scoreHome,10);assert.equal(s.goal_scoreAway,4);
    await input('scoreHome','5');await input('goal_scoreAway','2');await input('goal_side','home','change');await cdp.eval(panel,"(async()=>{await applyScoreCorrection();$('goal_sync').checked=true;await writeGoal();})()");s=JSON.parse(fs.readFileSync(file));assert.equal(s.scoreHome,6);assert.equal(s.scoreAway,2);assert.equal(s.goal_scoreHome,6);
    await input('scoreHome','6');await input('scoreAway','8');await cdp.eval(panel,"(async()=>{await applyScoreCorrection();await quickScore('away');})()");s=JSON.parse(fs.readFileSync(file));assert.equal(s.scoreHome,6);assert.equal(s.scoreAway,9);assert.equal(s.goal_team,'主队甲','Score-only change does not replace prepared event content');
    await input('scoreHome','7');await input('scoreAway','3');await input('goal_side','home','change');await cdp.eval(panel,'writeScoreboard();WRITE_QUEUE');
    await cdp.eval(panel,'lineupAllWrite(false);WRITE_QUEUE');
    await fetch(server.base+'/api/d200/action/home_score_plus',{method:'POST'});await cdp.until(panel,"$('scoreHome').value==='8'&&$('goal_scoreHome').value==='8'");
    await input('sub_off_num','10');await input('sub_on_num','12');assert.deepEqual(await cdp.eval(panel,"[$('sub_off_name').value,$('sub_on_name').value]"),['主十','主十二']);
    const beforeLegacy=fs.readFileSync(file,'utf8');await cdp.eval(panel,"window.realFetch=window.fetch;window.fetch=function(url,opts){if(String(url).endsWith('/api/d200/status'))return Promise.resolve(new Response(JSON.stringify({ok:true,score:{home:8,away:3}}),{headers:{'Content-Type':'application/json'}}));return realFetch(url,opts);};executeSubstitution()");assert.equal(fs.readFileSync(file,'utf8'),beforeLegacy,'Old backend must not report a successful title-only substitution');assert(await cdp.eval(panel,"$('sub_match_hint').textContent.includes('旧版本')"));await cdp.eval(panel,'window.fetch=realFetch');
    const viewer=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(viewer,"S.teamHome==='主队甲'");await cdp.eval(panel,'executeSubstitution()');await cdp.until(viewer,"$('sub').classList.contains('on')&&$('subOffName').textContent==='主十'&&$('subOnName').textContent==='主十二'");
    await delay(650);await cdp.eval(viewer,"document.body.style.background='#426347'");
    const bounds=await cdp.eval(viewer,"(()=>{var r=$('sub').getBoundingClientRect();return {x:r.left-20,y:r.top-20,width:r.width+40,height:r.height+40,scale:1};})()");const shot=await cdp.send('Page.captureScreenshot',{format:'png',clip:bounds,captureBeyondViewport:true},viewer);fs.writeFileSync(path.resolve(__dirname,'../docs/screenshots/broadcast-substitution.png'),Buffer.from(shot.data,'base64'));
    await input('goal_num','10');assert(await cdp.eval(panel,"$('goal_match_hint').textContent.includes('多名')"),'Two off-field players with the same number require a choice');await input('goal_roster_player','home|10|主十','change');assert.equal(await cdp.eval(panel,"$('goal_name').value"),'主十','A now off-field former starter remains selectable');
    await input('goal_num','12');assert.equal(await cdp.eval(panel,"$('goal_name').value"),'主十二');
    await input('restart_side','home','change');await input('restart_num','12');assert.equal(await cdp.eval(panel,"$('restart_player').value"),'12 主十二');assert(await cdp.eval(panel,"document.querySelector('[data-side=home][data-onfield=true] [data-player=\"home|12|主十二\"]')!==null"),'Live lineup includes incoming player');assert(await cdp.eval(panel,"document.querySelector('[data-side=home][data-onfield=false] [data-player=\"home|10|主十\"]')!==null"),'Live lineup moves outgoing player outside');
    await cdp.eval(panel,"lineupAllShow();WRITE_QUEUE");await cdp.until(viewer,"$('lineupAll').querySelector('[data-player=\"home|12|主十二\"] .lu-name')?.textContent==='主十二'");
    assert(await cdp.eval(viewer,"!$('lineupAll').querySelector('.lu-status,.off-pitch')&&$('lineupAll').querySelector('[data-player=\"home|10|主十\"] .lu-cap').classList.contains('show')"),'Broadcast roster keeps captain but omits on/off indicators and dimming');
    assert(await cdp.eval(viewer,"(()=>{var a=$('lineupAll').querySelector('[data-player=\"home|10|主十\"] .lu-name'),b=$('lineupAll').querySelector('[data-player=\"home|7|主七\"] .lu-name');return getComputedStyle(a).color===getComputedStyle(b).color;})()"),'Substituted players have the same name color');
    assert(await cdp.eval(panel,"Array.from($('goal_roster_player').querySelector('optgroup').children).some(e=>e.value==='home|12|主十二')"),'Newly substituted player appears in field-priority group');
    assert(await cdp.eval(panel,"!Array.from($('sub_off_player').options).some(e=>e.value==='home|10|主十')"));assert(await cdp.eval(panel,"Array.from($('sub_on_player').options).some(e=>e.value==='home|10|主十')"));
    await input('sub_off_num','12');await input('sub_on_player','home|10|主十','change');await cdp.eval(panel,"prepareD200('sub')");await cdp.until(panel,"$('writeStatus').textContent==='已保存'");
    let status=await (await fetch(server.base+'/api/d200/action/sub_show',{method:'POST'})).json();assert.equal(status.ok,true);await cdp.until(panel,"Array.from($('sub_off_player').options).some(e=>e.value==='home|10|主十')");
    await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('goal_roster_player').options.length===5");assert(await cdp.eval(panel,"Array.from($('goal_roster_player').querySelector('optgroup').children).some(e=>e.value==='home|10|主十')"),'Field state survives reload');
    const preview=await cdp.page(server.base+'/control/preview.html');await cdp.until(preview,"typeof TEMPLATES!=='undefined' && $('frame').contentWindow.EDIT===true");await cdp.eval(preview,"select(TEMPLATES.findIndex(t=>t.key==='sub'))");assert.equal(await cdp.eval(preview,"$('frame').src"),server.base+'/titles/graphics.html?only=sub&edit=1','Substitution preview retains editing controls');
    await cdp.send('Page.bringToFront',{},panel);await cdp.eval(panel,"selectPanelTab('match');setStatus('paused');WRITE_QUEUE");await delay(200);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2},panel);await delay(200);
    assert.equal(await cdp.eval(panel,"$('matchStatus').value"),'paused');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);
    await cdp.eval(panel,"window.scrollTo(0,0);FBPDesk.task('goal')");
    const hoverRect=await cdp.eval(panel,"(()=>{var r=$('event-goal').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:hoverRect.x+20,y:hoverRect.y+20},panel);
    await delay(180);
    assert.equal(await cdp.eval(panel,"getComputedStyle($('event-goal'),'::before').display"),'none','Content surface has no decorative hover elevation');
    assert.deepEqual(await cdp.eval(panel,"(()=>{var r=$('event-goal').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()"),hoverRect);
    let styleShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);fs.writeFileSync(path.resolve(__dirname,'../docs/screenshots/control-selection-hover.png'),Buffer.from(styleShot.data,'base64'));
    await cdp.send('Page.bringToFront',{},viewer);await cdp.eval(viewer,"$('lineup').style.visibility='hidden';$('sub').style.visibility='hidden';$('goal').style.visibility='hidden';$('sb').classList.add('on')");await delay(500);const scoreClip=await cdp.eval(viewer,"(()=>{var r=$('sb').getBoundingClientRect();return {x:r.left-12,y:Math.max(0,r.top-25),width:r.width+24,height:r.height+50,scale:1};})()");styleShot=await cdp.send('Page.captureScreenshot',{format:'png',clip:scoreClip,captureBeyondViewport:true},viewer);fs.writeFileSync(path.resolve(__dirname,'../docs/screenshots/broadcast-score-shadow.png'),Buffer.from(styleShot.data,'base64'));
    if(process.env.FBP_REFERENCE_VIDEO){
      const reference=await cdp.page('about:blank');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false},reference);
      const source='data:video/mp4;base64,'+fs.readFileSync(process.env.FBP_REFERENCE_VIDEO).toString('base64');await cdp.eval(reference,`document.body.style.margin='0';document.body.innerHTML='<video id="reference" muted style="width:1000px;height:700px;object-fit:contain;background:#f5f5f7"></video>';document.getElementById('reference').src=${JSON.stringify(source)};`);await cdp.until(reference,"document.getElementById('reference').readyState>=2");const textTime=await cdp.eval(reference,"document.getElementById('reference').duration");console.log('Reference recording duration '+textTime+'s');
      for(const time of [1,4]){await cdp.eval(reference,`new Promise(resolve=>{var v=document.getElementById('reference');v.onseeked=resolve;v.currentTime=Math.min(${time},v.duration-.1);})`);const rshot=await cdp.send('Page.captureScreenshot',{format:'png'},reference);fs.writeFileSync(path.resolve(__dirname,'../docs/screenshots/reference-hover-'+time+'.png'),Buffer.from(rshot.data,'base64'));}
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
    console.log('PASS live linked score fields, protected drafts, both-team number lookup, on-field priority, missing/duplicate numbers, editable manual names, player selection, team/color links, CSV import, D200 score sync, on-air substitutions, return substitutions and reload persistence');
  }finally{
    if(cdp)await cdp.send('Browser.close').catch(()=>{});if(browser&&!browser.killed)browser.kill();if(server)await stop(server.child);await delay(400);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-links-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
