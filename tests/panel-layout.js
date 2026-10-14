// Responsive layout checks use isolated match data and a temporary Edge profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {CDP}=require('./browser');
const {startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-layout-'));
  const profile=path.join(temp,'edge'),stateFile=path.join(temp,'state.json');
  const baseline=process.argv.includes('--baseline');
  const out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(stateFile,JSON.stringify({teamHome:'主队',teamAway:'客队',scoreHome:2,scoreAway:1,period:'下半场',sb_clockacc:3825000,sb_clockrun:1,scoreboard_show:true,clock_mm:15,clock_show:false,animdur:1.35,hold_goal:5.6,hold_card:5,hold_rst:4.5,hold_ply:4.5,theme_accent:'#FF9500',
    xiH_team:'主队',xiA_team:'客队',xiH_players:'1 球员甲\n10 球员乙 (C)\n9 球员丙'}));
  let server,browser,cdp;
  try{
    server=await startServer('node',stateFile);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
      '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);
    assert(fs.existsSync(active),'Edge did not start');
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);
    const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
    cdp=new CDP(ws);const panel=await cdp.page(server.base+'/control/panel.html');
    await cdp.until(panel,"$('teamHome').value==='主队'");
    assert(await cdp.eval(panel,"getComputedStyle(document.body).backgroundImage.includes('linear-gradient')"),'Public build uses its neutral local panel background');
    const untouched=fs.readFileSync(stateFile,'utf8');
    for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},panel);
      await cdp.eval(panel,'window.scrollTo(0,0)');await delay(250);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);
      fs.writeFileSync(path.join(out,(baseline?'before-':'control-')+label+'.png'),Buffer.from(shot.data,'base64'));
      if(baseline)continue;
      for(const tab of ['match','events','lineups','appearance','devices']){
        await cdp.eval(panel,"selectPanelTab('"+tab+"')");
        await delay(100);
        if(label==='desktop'){
          const paired=await cdp.eval(panel,"Array.from(document.querySelectorAll('#view-"+tab+" .card-grid>div.card:not(.logo-card)')).map(c=>{const r=c.getBoundingClientRect(),h=c.querySelector('.card-header').getBoundingClientRect(),f=c.querySelector('.card-footer'),btn=f.querySelector('.btn'),first=c.querySelector('.card-body input,.card-body select');return {top:r.top,bottom:r.bottom,width:r.width,header:h.bottom,action:btn?btn.getBoundingClientRect().top:null,first:first?first.getBoundingClientRect().top:null};})");
          for(let i=0;i+1<paired.length;i+=2){for(const key of ['top','bottom','width','header','action'])assert(Math.abs(paired[i][key]-paired[i+1][key])<1,tab+' paired '+key);}
        }
        assert.equal(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),true,label+' overflow in '+tab);
        assert.equal(await cdp.eval(panel,"document.querySelectorAll('[role=tabpanel]:not([hidden])').length"),1);
        const missing=await cdp.eval(panel,"Array.from(document.querySelectorAll('#view-"+tab+" input,#view-"+tab+" select,#view-"+tab+" textarea')).filter(e=>!e.labels.length&&!e.getAttribute('aria-label')).map(e=>e.id)");
        assert.deepEqual(missing,[],label+' unlabelled fields');
        const alignment=await cdp.eval(panel,"Array.from(document.querySelectorAll('#view-"+tab+" .frow')).flatMap(row=>{var fields=Array.from(row.children).filter(e=>e.classList.contains('field'));if(fields.length<2)return [];var rects=fields.map(e=>({label:e.querySelector('label').getBoundingClientRect(),control:e.children[1].getBoundingClientRect()}));return rects.flatMap((a,i)=>rects.slice(i+1).filter(b=>Math.abs(a.label.top-b.label.top)<1&&Math.abs(a.control.top-b.control.top)>1).map(b=>({label:a.label.top,control:a.control.top,other:b.control.top})));})");
        assert.deepEqual(alignment,[],label+' misaligned labels/controls in '+tab);
        const heights=await cdp.eval(panel,"Array.from(document.querySelectorAll('#view-"+tab+" input[type=text],#view-"+tab+" select,#view-"+tab+" input[type=file],#view-"+tab+" .btn')).filter(e=>e.getClientRects().length&&!e.closest('.number-control')&&!e.closest('h2')).map(e=>({id:e.id,height:e.getBoundingClientRect().height})).filter(e=>Math.abs(e.height-44)>1)");
        assert.deepEqual(heights,[],label+' inconsistent control height in '+tab);
        // Every rendered field family and card must carry the shared material,
        // not just the player picker. The inner numeric input uses its wrapper.
        const opaque=await cdp.eval(panel,"Array.from(document.querySelectorAll('#view-"+tab+" .card,#view-"+tab+" input[type=text],#view-"+tab+" select,#view-"+tab+" textarea,#view-"+tab+" input[type=file],#view-"+tab+" input[type=color],#view-"+tab+" .number-control,#view-"+tab+" .range-control,#view-"+tab+" .btn')).filter(e=>e.getClientRects().length&&!e.matches('.number-control input')).filter(e=>{var s=getComputedStyle(e),c=s.backgroundColor;return !c.startsWith('rgba(')||s.backdropFilter==='none';}).map(e=>e.id||e.className)");
        assert.deepEqual(opaque,[],label+' missing glass material in '+tab);
        if(label==='desktop'&&tab==='appearance'){
          const tops=await cdp.eval(panel,"Array.from(document.querySelectorAll('.appearance-grid .card-footer .btns')).map(e=>e.getBoundingClientRect().top)");
          assert(Math.abs(tops[0]-tops[1])<1,'Settings footer actions must align');
          await cdp.eval(panel,"document.querySelector('#view-appearance .section-heading').scrollIntoView({block:'start'});window.scrollBy(0,-84)");
          const settingsShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);
          fs.writeFileSync(path.join(out,'control-settings-alignment.png'),Buffer.from(settingsShot.data,'base64'));
          await cdp.eval(panel,'window.scrollTo(0,0)');
        }
        if(tab!=='match'){
          await delay(250); // Capture the settled segmented indicator, not a transition frame.
          const groupShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);
          fs.writeFileSync(path.join(out,'control-'+tab+'-'+label+'.png'),Buffer.from(groupShot.data,'base64'));
        }
      }
      await cdp.eval(panel,"selectPanelTab('match')");
      assert.equal(await cdp.eval(panel,"$('teamHome').value"),'主队');
      await cdp.eval(panel,"$('teamHome').value='测试未保存队名';selectPanelTab('events');selectPanelTab('match')");
      assert.equal(await cdp.eval(panel,"$('teamHome').value"),'测试未保存队名');
      await cdp.eval(panel,"$('teamHome').value='主队'");
      await cdp.eval(panel,"$('log').classList.remove('collapsed')");
      assert.equal(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),true);
      await cdp.eval(panel,"$('log').classList.add('collapsed')");
    }
    if(!baseline){
      // Material preferences must preserve readable controls and native keyboard use.
      await cdp.eval(panel,"selectPanelTab('events');$('goal_sync').focus()");const checked=await cdp.eval(panel,"$('goal_sync').checked");
      for(let i=0;i<2;i++){await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32},panel);await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32},panel);assert.equal(await cdp.eval(panel,"$('goal_sync').checked"),i===0?!checked:checked,'Apple toggle retains Space-key behavior');}
      await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]},panel);
      assert(await cdp.eval(panel,"['.app-header','.panel-nav','.match-strip'].every(s=>getComputedStyle(document.querySelector(s)).backdropFilter==='none')"),'Reduced transparency removes backdrop compositing');
      assert.equal(await cdp.eval(panel,"getComputedStyle(document.querySelector('.card')).backgroundColor"),'rgb(255, 255, 255)','Reduced transparency uses opaque cards');
      assert(await cdp.eval(panel,"(()=>{var lens=document.querySelector('.tab-indicator');return lens.hasAttribute('data-fluid')?getComputedStyle(lens.querySelector('path')).fill==='rgb(255, 255, 255)'&&getComputedStyle(lens).backgroundColor==='rgba(0, 0, 0, 0)':getComputedStyle(lens).backgroundColor==='rgb(255, 255, 255)';})()"),'Reduced transparency fills the rounded lens without adding a rectangular host background');
      await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-contrast',value:'more'}]},panel);assert.equal(await cdp.eval(panel,"getComputedStyle(document.querySelector('.card')).borderTopColor"),'rgb(136, 136, 146)','Increased contrast restores explicit surface boundaries');
      await cdp.send('Emulation.setEmulatedMedia',{features:[]},panel);assert.equal(fs.readFileSync(stateFile,'utf8'),untouched,'Material and accessibility changes do not write match data');
      await cdp.eval(panel,"selectPanelTab('appearance')");
      assert.equal(await cdp.eval(panel,"$('animdurVal').textContent"),'1.35×','Slider label must show saved value');
      assert.equal(await cdp.eval(panel,"document.querySelector('[data-color-for=theme_accent]').value"),'#ff9500');
      await cdp.eval(panel,"document.querySelector('[data-number-for=hold_goal][data-direction=\"1\"]').click()");
      assert.equal(await cdp.eval(panel,"$('hold_goal').value"),'5.7');
      await cdp.eval(panel,"$('hold_goal').focus()");
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',modifiers:8},panel);
      assert.equal(await cdp.eval(panel,"$('hold_goal').value"),'6.7','Shift-arrow coarse step');
      await cdp.eval(panel,"$('hold_goal').value='invalid';$('hold_goal').blur()");
      assert.equal(await cdp.eval(panel,"$('hold_goal').value"),'6.7','Invalid draft restores last valid value');
      await cdp.eval(panel,"$('hold_goal').focus();$('hold_goal').value='22'");
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},panel);
      assert.equal(await cdp.eval(panel,"$('hold_goal').value"),'6.7');
      await cdp.eval(panel,"document.querySelector('[data-color-for=theme_accent]').value='#ff3b30';document.querySelector('[data-color-for=theme_accent]').dispatchEvent(new Event('input',{bubbles:true}));$('animdur').value='1.75';$('animdur').dispatchEvent(new Event('input',{bubbles:true}))");
      assert.equal(await cdp.eval(panel,"$('theme_accent').value"),'#FF3B30');
      assert.equal(await cdp.eval(panel,"$('animdurVal').textContent"),'1.75×');
      assert.equal(fs.readFileSync(stateFile,'utf8'),untouched,'Widget edits must remain drafts until Apply');
      // Real pointer movement exercises MicroKit's adapted scrub behavior.
      await cdp.eval(panel,"$('hold_goal').scrollIntoView({block:'center'});document.activeElement.blur()");
      const scrub=await cdp.eval(panel,"(()=>{var r=$('hold_goal').getBoundingClientRect();return {x:r.x+12,y:r.y+r.height/2};})()");
      for(const [type,x,buttons] of [['mousePressed',scrub.x,1],['mouseMoved',scrub.x+20,1],['mouseReleased',scrub.x+20,0]]){
        await cdp.send('Input.dispatchMouseEvent',{type,x,y:scrub.y,button:'left',buttons,clickCount:1},panel);
      }
      assert.equal(await cdp.eval(panel,"$('hold_goal').value"),'7.2');
      assert.equal(fs.readFileSync(stateFile,'utf8'),untouched);
      await cdp.eval(panel,"applyCustom();WRITE_QUEUE");
      let applied=JSON.parse(fs.readFileSync(stateFile,'utf8'));
      assert.equal(applied.hold_goal,'7.2');assert.equal(applied.animdur,1.75);
      await cdp.eval(panel,"defaultTheme();WRITE_QUEUE");
      assert.equal(await cdp.eval(panel,"document.querySelector('[data-color-for=theme_accent]').value"),'#ffd400');
      await cdp.eval(panel,"defaultCustom();WRITE_QUEUE");
      assert.equal(await cdp.eval(panel,"$('animdurVal').textContent"),'1.00×');
      assert.equal(await cdp.eval(panel,"$('hold_goal').dataset.numberSaved"),'5.6');
      applied=JSON.parse(fs.readFileSync(stateFile,'utf8'));
      // A standalone deployment serves every widget resource through both built-in servers.
      let ps;
      try{
        ps=await startServer('powershell',stateFile);
        for(const base of [server.base,ps.base])for(const file of ['panel.html','glass-theme.css','panel-layout.css','panel-layout.js','microkit-controls.js']){
          const response=await fetch(base+'/control/'+file);assert.equal(response.status,200);assert((await response.text()).length>100);
        }
      }finally{if(ps)await stop(ps.child);}
      assert.equal(cdp.events.filter(e=>e.sessionId===panel&&e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)&&!e.params.request.url.startsWith(server.base+'/')).length,0,'No MicroKit, CDN or development-server requests');
      console.log('PASS aligned 44px controls, settings footers, color picker, saved slider value, numeric keys/drag, apply-only writes and standalone Node/PowerShell assets');
      for(const width of [320,768,1280,720]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},panel);
        await cdp.eval(panel,"$('liveHome').textContent='很长的主队名称主队业余足球联赛代表队';$('liveAway').textContent='很长的客队名称测试足球俱乐部';$('logBox').textContent='失败测试 / '+ 'x'.repeat(150);$('log').classList.remove('collapsed')");
        for(const tab of ['match','events','lineups','appearance','devices']){
          await cdp.eval(panel,"selectPanelTab('"+tab+"')");
          const overflow=await cdp.eval(panel,"Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,12)");
          assert.equal(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),true,width+' overflow '+tab+' '+JSON.stringify(overflow));
        }
      }
      await cdp.eval(panel,"$('log').classList.add('collapsed');selectPanelTab('match');document.querySelector('.preset-card').open=true");
      assert.equal(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),true);
      assert.deepEqual(JSON.parse(fs.readFileSync(stateFile,'utf8')),applied,'Navigation must never write match state');
      await cdp.eval(panel,"$('tab-match').focus()");
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'},panel);
      assert.equal(await cdp.eval(panel,"document.activeElement.id"),'tab-events');
      assert.equal(await cdp.eval(panel,"$('view-match').hidden"),true);
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'},panel);
      assert.equal(await cdp.eval(panel,'document.activeElement.id'),'tab-devices');
      // A hardware change refreshes the live summary without replacing unsaved field edits.
      await cdp.eval(panel,"$('teamHome').value='未保存';");
      await fetch(server.base+'/api/d200/action/home_goal',{method:'POST'});
      await cdp.until(panel,"$('liveScore').textContent==='3 : 1'");
      assert.equal(await cdp.eval(panel,"$('teamHome').value"),'未保存');
      assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
      console.log('PASS responsive groups, field labels, keyboard navigation, preserved edits and remote live score');
    }else assert.equal(fs.readFileSync(stateFile,'utf8'),untouched);
    console.log('Screenshots: '+out);
  }finally{
    if(cdp){try{await cdp.send('Browser.close');}catch(_){}cdp.ws.close();}
    if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}
    if(server)await stop(server.child);
    if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup path');
    await delay(500);fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
