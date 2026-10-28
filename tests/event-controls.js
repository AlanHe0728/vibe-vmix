// The three event actions must separate drafts, saved content, and execution.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-event-actions-')),profile=path.join(temp,'edge'),real=path.resolve(__dirname,'../control/state.json'),original=fs.readFileSync(real);
  let browser,cdp,server;
  try{
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--window-size=1920,1080','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    for(const backend of process.platform==='win32'?['node','powershell']:['node']){
      const file=path.join(temp,backend+'.json');fs.writeFileSync(file,JSON.stringify({teamHome:'主队',teamAway:'客队',scoreHome:2,scoreAway:1,xiH_players:'1 门将 (GK)\n7 七号\n10 队长 (C)',subH_players:'12 十二号\n13 十三号',xiA_players:'1 客门将',clock_mode:'down',clock_mm:15,clock_ss:0,clock_show:false,goal_tick:0,card_tick:0,player_tick:0,restart_tick:0,sub_tick:0}));
      server=await startServer(backend,file);
      const panel=await cdp.page(server.base+'/control/panel.html');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);await cdp.send('Page.bringToFront',{},panel);await cdp.until(panel,"!$('topClockToggle').disabled&&$('goal_roster_player').options.length===6");
      const read=()=>JSON.parse(fs.readFileSync(file));
      async function input(id,value){await cdp.eval(panel,`$('${id}').value=${JSON.stringify(value)};$('${id}').dispatchEvent(new Event('input',{bubbles:true}));$('${id}').dispatchEvent(new Event('change',{bubbles:true}))`);}
      async function action(kind,mode){
        await cdp.eval(panel,`FBPDesk.task('${kind}')`);
        const selector=`#event-${kind} .event-actions button:nth-child(${['save-execute','save','execute'].indexOf(mode)+1})`;
        await cdp.eval(panel,`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
        const point=await cdp.eval(panel,`(()=>{var b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!b.contains(document.elementFromPoint(x,y)))throw Error('Obscured event action');return {x,y};})()`);
        for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
        await cdp.until(panel,`!document.querySelector(${JSON.stringify(selector)}).disabled`);await cdp.eval(panel,'WRITE_QUEUE');
      }
      const posts=()=>cdp.events.filter(e=>e.sessionId===panel&&e.method==='Network.requestWillBeSent'&&e.params.request.method==='POST').length;
      for(const kind of ['goal','card','player','restart','sub','timer'])assert.deepEqual(await cdp.eval(panel,`Array.from(document.querySelectorAll('#event-${kind} .event-actions button')).map(b=>b.textContent)`),['保存并执行','仅保存','执行']);
      for(const kind of ['goal','card','player','restart']){
        const tick=kind+'_tick',before=read(),startPosts=posts();
        await cdp.eval(panel,`FBPDesk.task('${kind}')`);await input(kind+'_name','已保存'+kind);
        if(kind==='card'||kind==='restart')await input(kind+'_type',kind==='card'?'red':'corner');
        assert.equal(posts(),startPosts,'Editing fields and type does not send a command');
        await action(kind,'save');let s=read();assert.equal(s[kind+'_name'],'已保存'+kind);assert.equal(s[tick],before[tick]);assert.equal(s.scoreHome,2,'Saving never scores');
        await input(kind+'_name','未保存'+kind);
        if(kind==='card'||kind==='restart')await input(kind+'_type',kind==='card'?'yellow':'freekick');
        await delay(1100);
        if(kind==='card'||kind==='restart')assert.equal(await cdp.eval(panel,`$('${kind}_type').value`),kind==='card'?'yellow':'freekick','Polling protects unsaved event type');
        await action(kind,'execute');s=read();assert.equal(s[kind+'_name'],'已保存'+kind);assert(s[tick]>before[tick]);assert.equal(await cdp.eval(panel,`$('${kind}_name').value`),'未保存'+kind,'Execution preserves local drafts');
        if(kind==='card'||kind==='restart')assert.equal(s[kind+'_trigger'],kind==='card'?'red':'corner','Execution uses saved type');
        const count=posts(),lastTick=s[tick];await action(kind,'save-execute');s=read();assert.equal(posts(),count+1,'Save and execute is one atomic state write');assert.equal(s[kind+'_name'],'未保存'+kind);assert(s[tick]>lastTick);assert.equal(s.scoreHome,2,'Goal action defaults to playback without scoring');
        if(kind==='card'||kind==='restart')assert.equal(s[kind+'_trigger'],kind==='card'?'yellow':'freekick');
      }
      await cdp.eval(panel,"FBPDesk.task('sub')");await input('sub_off_num','7');await input('sub_on_num','12');let before=read();await action('sub','save');let s=read();assert.equal(s.sub_off_id,'home|7|七号');assert.deepEqual(s.onfield_home,before.onfield_home);assert.equal(s.sub_tick,0,'Saving substitution does not move players');
      await input('sub_off_num','10');await input('sub_on_num','13');await action('sub','execute');s=read();assert(s.onfield_home.includes('home|12|十二号'));assert(!s.onfield_home.includes('home|7|七号'));assert(s.onfield_home.includes('home|10|队长'),'Unsaved alternate pair is not used');
      await action('sub','save-execute');s=read();assert(s.onfield_home.includes('home|13|十三号'));assert(!s.onfield_home.includes('home|10|队长'));
      const executed=fs.readFileSync(file,'utf8');await action('sub','execute');assert.equal(fs.readFileSync(file,'utf8'),executed,'Repeated invalid swap is rejected without replay');assert(await cdp.eval(panel,"$('writeStatus').textContent.startsWith('保存失败')"));
      await cdp.eval(panel,"FBPDesk.task('timer')");await input('clock_label','已保存计时');await input('clock_mm','2');await input('clock_ss','30');before=read();await action('timer','save');s=read();assert.deepEqual(s.clock_state,before.clock_state,'Saving a timer does not reset its anchor');assert.equal(s.clock_show,false);assert.equal(s.clock_preset.mm,2);
      await input('clock_label','未保存计时');await input('clock_mm','9');await input('clock_ss','10');await action('timer','execute');s=read();assert.equal(s.clock_label,'已保存计时');assert.equal(s.clock_state.accMs,150000);assert.equal(s.clock_show,true);
      await cdp.eval(panel,"clockCmd('plus');WRITE_QUEUE");assert.equal(read().clock_state.accMs,210000);await action('timer','execute');assert.equal(read().clock_state.accMs,150000,'Saved duration survives transport commands');
      await action('timer','save-execute');s=read();assert.equal(s.clock_label,'未保存计时');assert.equal(s.clock_state.accMs,550000);
      await cdp.eval(panel,"FBPDesk.task('goal');$('goal_sync').checked=true");await action('goal','save-execute');assert.equal(read().scoreHome,3);assert.equal(await cdp.eval(panel,"$('goal_sync').checked"),false);await action('goal','execute');assert.equal(read().scoreHome,3,'Executing saved goal cannot score again');
      const originalState=fs.readFileSync(file,'utf8');await cdp.eval(panel,"window.realFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return realFetch(url,opt);};$('goal_name').value='保存失败草稿';");await action('goal','save-execute');assert.equal(fs.readFileSync(file,'utf8'),originalState,'Failed save and execute cannot partially save or trigger');assert.equal(await cdp.eval(panel,"$('goal_name').value"),'保存失败草稿');await cdp.eval(panel,'window.fetch=realFetch');
      await cdp.send('Page.reload',{},panel);await cdp.until(panel,"!$('topClockToggle').disabled");assert.equal(await cdp.eval(panel,"$('card_type').value"),'yellow');assert.equal(await cdp.eval(panel,"$('restart_type').value"),'freekick');assert.equal(await cdp.eval(panel,"$('clock_mm').value"),'9');
      for(const width of [1440,390,320]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},panel);
        for(const kind of ['goal','card','player','restart','sub','timer']){await cdp.eval(panel,`FBPDesk.task('${kind}')`);assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),width+' overflow '+kind);assert(await cdp.eval(panel,`Array.from(document.querySelectorAll('#event-${kind} .event-actions button')).every(b=>Math.abs(b.getBoundingClientRect().height-44)<1)`),'Consistent action height');}
      }
      if(backend==='node'){
        const out=path.resolve(__dirname,'../docs/screenshots');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);await cdp.eval(panel,"FBPDesk.task('goal');window.scrollTo(0,0)");await delay(250);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);fs.writeFileSync(path.join(out,'control-event-actions.png'),Buffer.from(shot.data,'base64'));
      }
      console.log('PASS '+backend+' six three-button footers, saved/draft separation, type selection, atomic save-execute, no double score, saved-pair substitutions, timer preset retention, failures, refresh and 320/390/1440 layouts');
      await stop(server.child);server=null;
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,JSON.stringify(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown')));assert.deepEqual(fs.readFileSync(real),original,'Real custom data is untouched');
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(250);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);await delay(300);if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('fbp-event-actions-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
