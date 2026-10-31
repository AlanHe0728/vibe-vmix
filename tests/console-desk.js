// Console workflow regression. All writes go to temporary synthetic match data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {CDP}=require('./browser');
const {startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-console-desk-')),profile=path.join(temp,'edge'),stateFile=path.join(temp,'state.json');
  const real=path.resolve(__dirname,'../control/state.json'),original=fs.existsSync(real)?fs.readFileSync(real):null;
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==';
  fs.writeFileSync(stateFile,JSON.stringify({teamHome:'上海主队',teamAway:'北京客队',scoreHome:2,scoreAway:1,period:'上半场',scoreboard_show:true,colorHome:'#C8102E',colorAway:'#00529F',homeLogo:pixel,homeLogo_filename:'主队队徽.png',xiH_players:'1 主门将 (GK)\n10 主队长 (C)\n7 主前锋',subH_players:'12 主替补\n13 主替补二',xiA_players:'1 客门将 (GK)\n9 客前锋',subA_players:'20 客替补',goal_tick:0,score_tick:0}));
  let server,browser,cdp;
  const out=path.resolve(__dirname,'../.impeccable/review');fs.mkdirSync(out,{recursive:true});
  try{
    server=await startServer('node',stateFile);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--window-size=1920,1080','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-background-timer-throttling','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active),'Headless browser started');
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    const panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"$('liveHome').textContent==='上海主队'&&!$('topClockToggle').disabled&&$('goal_roster_player').options.length===6");
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);
    async function click(selector,scroll=true){
      if(scroll)await cdp.eval(panel,`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      const point=await cdp.eval(panel,`(()=>{var b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,e=document.elementFromPoint(x,y);if(!e||!b.contains(e))throw Error('Obscured '+${JSON.stringify(selector)});return {x,y};})()`);
      for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    }
    async function settle(){await cdp.eval(panel,'WRITE_QUEUE');await delay(80);}
    async function capture(name){
      // A fresh target avoids stale compositor tiles after repeatedly emulating
      // different device sizes in the functional test target above.
      const screen=await cdp.page(server.base+'/control/panel.html');
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:name.startsWith('mobile')?390:1440,height:name.startsWith('mobile')?844:1000,deviceScaleFactor:1,mobile:false},screen);
      await cdp.send('Page.bringToFront',{},screen);
      await cdp.until(screen,"!$('topClockToggle').disabled&&$('squad_home_rows').children.length>0");
      if(name==='starting-picker')await cdp.eval(screen,"selectPanelTab('lineups');$('squadPicker').scrollIntoView({block:'start'})");
      if(name==='settings')await cdp.eval(screen,"selectPanelTab('appearance')");
      if(name==='timing-settings')await cdp.eval(screen,'FBPMatchTiming.toggle()');
      if(name==='header-scroll'||name==='mobile-scroll')await cdp.eval(screen,'window.scrollTo(0,44)');
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0},screen);await cdp.eval(screen,'document.fonts.ready');await delay(400);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},screen);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
      const info=await cdp.send('Target.getTargetInfo',{},screen);await cdp.send('Target.closeTarget',{targetId:info.targetInfo.targetId});
      await cdp.send('Page.bringToFront',{},panel);
    }
    const beforeNav=fs.readFileSync(stateFile,'utf8');
    assert.equal(await cdp.eval(panel,'getComputedStyle(document.body).backgroundColor'),'rgb(255, 255, 255)');assert.equal(await cdp.eval(panel,'getComputedStyle(document.body).backgroundImage'),'none','Plain white background, no wallpaper');
    assert.equal(await cdp.eval(panel,"getComputedStyle($('liveHome'),'::before').backgroundColor"),'rgb(200, 16, 46)');assert.equal(await cdp.eval(panel,"getComputedStyle($('liveAway'),'::before').backgroundColor"),'rgb(0, 82, 159)');
    assert.equal(await cdp.eval(panel,"document.querySelectorAll('.panel-nav [role=tab]').length"),2);
    assert.equal(await cdp.eval(panel,"document.querySelectorAll('main>section>.section-heading').length"),0,'Workspace names are not repeated as large headings');
    assert.equal(await cdp.eval(panel,"document.querySelectorAll('main .section-heading p,main .note,main .section-note').length"),0,'No redundant section subtitles or instructional note blocks');assert.equal(await cdp.eval(panel,"$('squadPicker').querySelector('h2').textContent"),'总名单');
    assert.equal(await cdp.eval(panel,"Array.from(document.querySelectorAll('.event-stage>.card')).filter(n=>n.getClientRects().length).length"),1);
    for(const tab of ['lineups','appearance','devices','match'])await cdp.eval(panel,`selectPanelTab('${tab}')`);
    for(const task of ['goal','card','sub','player','restart','timer']){await click('#task-'+task);assert.equal(await cdp.eval(panel,"Array.from(document.querySelectorAll('.event-stage>.card')).filter(n=>n.getClientRects().length).length"),1);}
    assert.equal(fs.readFileSync(stateFile,'utf8'),beforeNav,'Navigation and material effects never write match state');
    await cdp.eval(panel,"$('colorHome').value='#486956';$('colorAway').value='#3c6191';saveTeamColors();WRITE_QUEUE");assert.equal(await cdp.eval(panel,"getComputedStyle($('liveHome'),'::before').backgroundColor"),'rgb(72, 105, 86)');assert.equal(await cdp.eval(panel,"getComputedStyle($('liveAway'),'::before').backgroundColor"),'rgb(60, 97, 145)','Team strips follow saved colors');
    await cdp.eval(panel,"FBPDesk.task('goal');$('goal_num').value='10';$('goal_num').dispatchEvent(new Event('input',{bubbles:true}))");
    assert.equal(await cdp.eval(panel,"$('goal_name').value"),'主队长');
    assert.equal(await cdp.eval(panel,"$('goal_match_hint').textContent"),'');assert.equal(await cdp.eval(panel,"getComputedStyle($('goal_match_hint')).display"),'none','Successful matching does not reinsert instructional text or blank space');
    const viewer=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(viewer,"S.teamHome==='上海主队'");
    const rosterSaved=JSON.parse(fs.readFileSync(stateFile));await cdp.eval(panel,"window.rosterDraft=$('xiH_players').value;$('xiH_players').value+='\\n99 未保存球员';FBPLinks.rebuild()");
    await click('#lineupToggle',false);await settle();await cdp.until(viewer,"S.lineup_show===true&&$('lineup').classList.contains('on')");assert.equal(await cdp.eval(panel,"$('lineupToggle').getAttribute('aria-pressed')"),'true');
    let rosterShown=JSON.parse(fs.readFileSync(stateFile));assert.equal(rosterShown.xiH_players,rosterSaved.xiH_players,'Visibility cannot save roster drafts');assert.equal(rosterShown.lineup_mode,rosterSaved.lineup_mode,'Visibility retains the saved all/single selection');
    await cdp.eval(panel,"selectPanelTab('appearance');window.scrollTo(0,document.body.scrollHeight)");await click('#lineupToggle',false);await settle();await cdp.until(viewer,"S.lineup_show===false&&!$('lineup').classList.contains('on')");assert.equal(await cdp.eval(panel,"$('lineupToggle').getAttribute('aria-pressed')"),'false');
    const external=await fetch(server.base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lineup_show:true})});assert.equal(external.status,200);await cdp.until(panel,"$('lineupToggle').getAttribute('aria-pressed')==='true'");
    await click('#lineupToggle',false);await settle();await cdp.eval(panel,"$('xiH_players').value=window.rosterDraft;FBPLinks.rebuild();selectPanelTab('match')");
    await click('#homeScorePlus',false);await settle();await click('#awayScorePlus',false);await settle();
    let state=JSON.parse(fs.readFileSync(stateFile));assert.equal(state.scoreHome,3);assert.equal(state.scoreAway,2);assert.equal(state.goal_tick,0);assert.equal(state.score_tick,0);
    assert.equal(await cdp.eval(panel,"$('scoreHome').value=== '3'&&$('goal_scoreHome').value==='3'&&$('scoreAway').value==='2'&&$('goal_scoreAway').value==='2'"),true);
    assert.equal(await cdp.eval(viewer,"$('goal').classList.contains('on')"),false,'Quick +1 never plays a goal');
    await cdp.eval(panel,"Promise.all(Array.from({length:4},()=>quickScore('home')))");state=JSON.parse(fs.readFileSync(stateFile));assert.equal(state.scoreHome,7,'Rapid score-only operations are atomic');assert.equal(state.goal_tick,0);
    await cdp.eval(panel,"$('scoreHome').value='99';$('scoreHome').dispatchEvent(new Event('input',{bubbles:true}));writeGoal()");await settle();state=JSON.parse(fs.readFileSync(stateFile));assert.equal(state.scoreHome,7,'Playing animation never commits an unrelated score draft');assert(state.goal_tick>0);assert.equal(state.score_tick,0);await cdp.until(viewer,"$('goal').classList.contains('on')");
    await cdp.eval(panel,"$('goal_sync').checked=true;writeGoal()");await settle();assert.equal(JSON.parse(fs.readFileSync(stateFile)).scoreHome,8);assert.equal(await cdp.eval(panel,"$('goal_sync').checked"),false,'Explicit combined operation is one-use');
    await click('#scoreEditButton',false);assert.equal(await cdp.eval(panel,"$('scoreSettings').hidden"),false);
    await cdp.eval(panel,"$('scoreHome').value='4';$('scoreAway').value='3';applyScoreCorrection()");await settle();assert.equal(JSON.parse(fs.readFileSync(stateFile)).scoreHome,4);assert.equal(await cdp.eval(panel,"$('scoreSettings').hidden"),true);
    await click('#phaseSettingsButton',false);await cdp.eval(panel,"$('period').value='下半场';$('period').dispatchEvent(new Event('change',{bubbles:true}));$('matchStatus').value='paused';$('matchStatus').dispatchEvent(new Event('change',{bubbles:true}));WRITE_QUEUE");state=JSON.parse(fs.readFileSync(stateFile));assert.equal(state.period,'下半场');assert.equal(state.status,'paused');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},panel);assert.equal(await cdp.eval(panel,'document.activeElement.id'),'phaseSettingsButton');
    await click('#topClockSettingsButton',false);await cdp.eval(panel,"$('task-card').focus()");assert.equal(await cdp.eval(panel,"$('topClockSettings').hidden"),true,'Keyboard focus leaving a nonmodal flyout dismisses it');
    for(const tab of ['match','lineups','appearance','devices']){
      await cdp.eval(panel,`selectPanelTab('${tab}');window.scrollTo(0,document.body.scrollHeight)`);
      await click('#topClockToggle',false);await cdp.until(panel,"!$('topClockToggle').disabled&&$('topClockToggle').textContent==='暂停计时'");assert(JSON.parse(fs.readFileSync(stateFile)).sb_clock_state.running);
      await click('#topClockToggle',false);await cdp.until(panel,"!$('topClockToggle').disabled&&$('topClockToggle').textContent==='开始计时'");assert(!JSON.parse(fs.readFileSync(stateFile)).sb_clock_state.running);
    }
    await cdp.eval(panel,"selectPanelTab('match');FBPDesk.task('sub');$('sub_off_num').value='7';$('sub_off_num').dispatchEvent(new Event('input',{bubbles:true}));$('sub_on_num').value='12';$('sub_on_num').dispatchEvent(new Event('input',{bubbles:true}));executeSubstitution()");await settle();await cdp.until(panel,"Array.from($('goal_roster_player').options).some(o=>o.textContent.includes('主替补'))");
    state=JSON.parse(fs.readFileSync(stateFile));assert(state.onfield_home.includes('home|12|主替补'));assert(!state.onfield_home.includes('home|7|主前锋'));
    await cdp.eval(panel,"FBPDesk.task('restart');$('restart_num').value='12';$('restart_num').dispatchEvent(new Event('input',{bubbles:true}))");assert.equal(await cdp.eval(panel,"$('restart_name').value"),'主替补');
    await click('#scoreboardToggle',false);await settle();assert.equal(JSON.parse(fs.readFileSync(stateFile)).scoreboard_show,false);await click('#scoreboardToggle',false);await settle();assert.equal(JSON.parse(fs.readFileSync(stateFile)).scoreboard_show,true);
    // Defaults must override the historical browser preference for automatic goal scoring.
    await cdp.eval(panel,"localStorage.setItem('fbp_goal_sync','1')");await cdp.send('Page.reload',{},panel);await cdp.until(panel,"!$('topClockToggle').disabled");assert.equal(await cdp.eval(panel,"$('goal_sync').checked"),false);
    // A failed command does not invent a new toggle state or discard a score draft.
    await cdp.eval(panel,"window.originalFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return originalFetch(url,opt);};");await click('#topClockToggle',false);await settle();assert.equal(await cdp.eval(panel,"$('topClockToggle').textContent"),'开始计时');assert(!JSON.parse(fs.readFileSync(stateFile)).sb_clock_state.running);
    await click('#lineupToggle',false);await settle();assert.equal(await cdp.eval(panel,"$('lineupToggle').getAttribute('aria-pressed')"),'false','Failed visibility write keeps the confirmed state');assert.equal(JSON.parse(fs.readFileSync(stateFile)).lineup_show,false);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},panel);assert(await cdp.eval(panel,"!$('deskNotice').hidden&&$('deskNotice').textContent.includes('保存失败')&&$('deskNotice').getBoundingClientRect().bottom<=innerHeight"),'Mobile errors stay visible in the sticky functional layer');
    await cdp.eval(panel,"window.fetch=originalFetch;fetchState();$('log').classList.add('collapsed');$('writeStatus').textContent='已保存'");await cdp.until(panel,"$('connectionText').textContent==='服务已连接'&&$('deskNotice').hidden");
    const lastState=fs.readFileSync(stateFile,'utf8');
    for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['compact',320,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},panel);
      for(const task of ['goal','card','sub','player','restart','timer']){
        await cdp.eval(panel,`selectPanelTab('match');FBPDesk.task('${task}')`);await delay(60);
        assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),label+' task overflow: '+task);
        const heights=await cdp.eval(panel,"Array.from(document.querySelectorAll('.event-stage input[type=text],.event-stage select')).filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)");assert(heights.every(h=>Math.abs(h-44)<1),'Aligned 44px controls');
      }
      for(const tab of ['lineups','appearance','devices']){await cdp.eval(panel,`selectPanelTab('${tab}')`);assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),label+' workspace overflow: '+tab);}
      await cdp.eval(panel,"selectPanelTab('match');FBPDesk.task('goal');$('writeStatus').textContent='已保存';window.scrollTo(0,0)");
      assert(await cdp.eval(panel,"(()=>{var chrome=document.querySelector('.console-chrome'),header=document.querySelector('.app-header'),rule=getComputedStyle(chrome,'::after'),top=getComputedStyle(header,'::after'),strip=document.querySelector('.match-strip').getBoundingClientRect(),nav=document.querySelector('.event-nav').getBoundingClientRect();return Math.abs(parseFloat(rule.width)-strip.width)<1&&Math.abs(parseFloat(top.width)-strip.width)<1&&parseFloat(rule.height)>=16&&rule.backgroundColor==='rgb(255, 255, 255)'&&nav.top>=chrome.getBoundingClientRect().bottom+20;})()"),'Toolbar dividers follow content width and have an opaque text-free gutter');
      if(label!=='compact')await capture(label);
      if(label!=='compact')await capture(label==='desktop'?'header-scroll':'mobile-scroll');
      if(label==='desktop'){
        await click('#topClockSettingsButton',false);await capture('timing-settings');await cdp.eval(panel,'FBPDesk.closeFlyout(false)');
        await cdp.eval(panel,"selectPanelTab('lineups');$('squadPicker').scrollIntoView({block:'start'})");await capture('starting-picker');
        await cdp.eval(panel,"selectPanelTab('appearance')");await capture('settings');
      }
    }
    assert.equal(fs.readFileSync(stateFile,'utf8'),lastState,'Viewport and navigation never write data');
    await cdp.eval(panel,"selectPanelTab('match');$('tab-match').focus()");await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'},panel);assert.equal(await cdp.eval(panel,'document.activeElement.id'),'tab-lineups');
    await cdp.eval(panel,"selectPanelTab('match');$('task-goal').focus()");await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'},panel);assert.equal(await cdp.eval(panel,'document.activeElement.id'),'task-card');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-reduced-motion',value:'reduce'}]},panel);assert.equal(await cdp.eval(panel,"getComputedStyle(document.querySelector('.console-chrome')).backdropFilter"),'none');
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,JSON.stringify(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown')));
    assert.deepEqual(fs.existsSync(real)?fs.readFileSync(real):null,original,'Real match data stays byte-for-byte intact');
    console.log('PASS score-only quick actions, atomic rapid clicks, isolated goal playback, one-use opt-in, cross-workspace clocks, phase/status, substitutions and number matching, failed-write recovery, responsive single-task UI, keyboard controls, accessibility preferences and untouched real data');
    console.log('Screenshots: '+out);
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);await delay(300);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-console-desk-'))throw Error('Unsafe temporary cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
