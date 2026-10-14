// User-requested workflows in the actual renderer and controller, using isolated data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-features-')),profile=path.join(temp,'edge');
  const file=path.join(temp,'state.json'),out=path.resolve(__dirname,'../docs/screenshots');
  const starters='1 球员甲\n2 球员丁\n3 球员戊\n4 球员己\n5 球员庚\n6 球员辛\n7 球员壬\n8 球员癸\n9 球员12\n10 球员乙 (C)\n11 球员13';
  const subs='12 球员23\n13 球员29\n14 球员30\n15 球员28\n16 球员32\n17 球员22\n18 球员31';
  fs.writeFileSync(file,JSON.stringify({teamHome:'主队',teamAway:'客队',scoreHome:2,scoreAway:1,scoreboard_show:true,sb_clockacc:3825000,
    lineup_show:true,lineup_active:'xiH',lineup_pos:{x:653,y:518},lineup_scale:.8,
    xiH_team:'主队',xiA_team:'客队',xiH_color:'#c8102e',xiA_color:'#00529f',
    xiH_players:starters,xiA_players:starters,subH_players:subs,subA_players:subs,
    clock_mm:15,clock_mode:'down',clock_show:true,goal_name:'球员乙',goal_num:'10',goal_team:'主队',player_name:'球员乙',player_num:'10',card_name:'球员12',card_num:'17'}));
  let server,browser,cdp;
  try{
    server=await startServer('node',file);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    const page=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(page,"$('lineupAll').querySelectorAll('.lu-row').length===36");await delay(650);
    const snapshot=fs.readFileSync(file,'utf8');
    assert.equal(await cdp.eval(page,'luIsAll()'),true,'Old data defaults to complete match lineup');
    assert.deepEqual(await cdp.eval(page,"[$('lineup').style.left,$('lineup').style.top,SCALE.lineup]"),['960px','580px',1]);
    assert.deepEqual(await cdp.eval(page,"Array.from(document.querySelectorAll('.lu-group-title')).map(e=>e.firstChild.textContent)"),['首发','替补','首发','替补']);
    const colors=await cdp.eval(page,"Array.from(document.querySelectorAll('.lu-team')).map(e=>getComputedStyle(e.querySelector('.lu-rn')).backgroundColor)");assert.notEqual(colors[0],colors[1]);
    assert(await cdp.eval(page,"(()=>{var a=document.querySelectorAll('.lu-group-title');return a[1].getBoundingClientRect().top===a[3].getBoundingClientRect().top;})()"),'Substitute sections are aligned across teams');
    assert(await cdp.eval(page,"(()=>{var r=$('lineup').getBoundingClientRect();return r.left>=96&&r.right<=1824&&r.top>=54&&r.bottom<=1026&&Array.from($('lineupAll').querySelectorAll('.lu-row')).every(e=>{var b=e.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom&&b.left>=r.left&&b.right<=r.right;});})()"),'Every player fits within title-safe complete panel');
    assert(await cdp.eval(page,"window.first=$('lineupAll').querySelector('.lu-row');luApply();first===$('lineupAll').querySelector('.lu-row')"),'Polling does not rebuild complete rosters');
    await cdp.eval(page,"document.body.style.background='#426347';$('clk').style.visibility='hidden';");
    const full=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},page);fs.writeFileSync(path.join(out,'broadcast-complete-lineup.png'),Buffer.from(full.data,'base64'));
    await cdp.eval(page,"S.lineup_mode='single';applyPos('lineup','lineup');luApply()");
    assert.deepEqual(await cdp.eval(page,"[$('lineup').style.left,$('lineup').style.top,SCALE.lineup]"),['653px','518px',.8]);
    for(const p of ['xiH','xiA','subH','subA']){await cdp.eval(page,`S.lineup_active='${p}';luApply()`);assert.equal(await cdp.eval(page,"$('lineupList').children.length"),p.startsWith('xi')?11:7);}
    // Wipes are actual clip transitions; the screen is neither instantly shown nor merely moved.
    await cdp.eval(page,"S.wipe_in=.8;S.wipe_out=.25;S.animdur=1;applyTheme();Object.keys(AUTO).forEach(id=>clearTimeout(AUTO[id]));['sb','clk','goal','card','rst','ply','lineup'].forEach(hideGraphic)");await delay(350);
    await cdp.eval(page,"['sb','clk','goal','card','rst','ply','lineup'].forEach(id=>$(id).classList.add('on'))");await delay(100);
    assert(await cdp.eval(page,"['sb','clk','goal','card','rst','ply','lineup'].every(id=>$(id).getAnimations().some(a=>a.transitionProperty==='clip-path'))"),'All seven graphics animate a wipe entrance');
    const middle=await cdp.eval(page,"getComputedStyle($('sb')).clipPath");assert(!middle.includes('-12px -12px -12px'),'Wipe has an intermediate clipping boundary');
    await delay(850);assert.equal(await cdp.eval(page,"getComputedStyle($('sb')).clipPath"),'inset(-48px -12px -12px)');
    await cdp.eval(page,"S.hold_goal=.35;goalShow()");await delay(1250);assert(await cdp.eval(page,"$('goal').classList.contains('on')"),'Hold time starts after repeated close and entrance complete');await delay(400);assert.equal(await cdp.eval(page,"$('goal').classList.contains('on')"),false);
    await cdp.eval(page,"CB={mode:'up',running:false,base:Date.now(),accMs:(3499*60+41)*1000};sbTick()");
    assert(await cdp.eval(page,"$('sbClock').scrollWidth<=$('sbClock').clientWidth"),'Very long clock values fit the clock cell');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},page);
    await cdp.eval(page,'goalShow()');assert.equal(await cdp.eval(page,"getComputedStyle($('goal')).clipPath"),'none');
    assert.equal(fs.readFileSync(file,'utf8'),snapshot,'Rendering never writes match state');
    const panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"$('xiH_team').value==='主队'");
    await cdp.eval(panel,"$('sb_clock_mm').value='45';$('sb_clock_ss').value='30';$('sb_clockmode').value='down';setMatchClock()");
    await cdp.until(panel,"$('writeStatus').textContent==='已保存'");let state=JSON.parse(fs.readFileSync(file));assert.equal(state.sb_clock_state.accMs,2730000);assert.equal(state.sb_clock_state.mode,'down');assert.equal(state.sb_clock_state.running,false);
    await cdp.eval(panel,"$('sb_clock_ss').value='70';setMatchClock()");await delay(100);assert.equal(JSON.parse(fs.readFileSync(file)).sb_clock_state.accMs,2730000,'Invalid seconds must not change clock');
    await cdp.eval(panel,'matchClockPreset(90)');await cdp.until(panel,"$('writeStatus').textContent==='已保存'");assert.equal(JSON.parse(fs.readFileSync(file)).sb_clock_state.accMs,5400000);
    await cdp.eval(panel,"$('wipe_in').value='1.2';$('wipe_out').value='.4';applyCustom()");await cdp.until(panel,"$('writeStatus').textContent==='已保存'");state=JSON.parse(fs.readFileSync(file));assert.equal(state.wipe_in,1.2);assert.equal(state.wipe_out,.4);
    await cdp.eval(panel,"$('subH_players').value='20 主队替补';$('subA_players').value='21 客队替补';lineupAllWrite(true)");await cdp.until(panel,"$('writeStatus').textContent==='已保存'");state=JSON.parse(fs.readFileSync(file));assert.equal(state.lineup_mode,'all');assert.equal(state.subH_players,'20 主队替补');assert.equal(state.subA_players,'21 客队替补');
    await cdp.eval(panel,"lineupWrite('subA')");await cdp.until(panel,"$('writeStatus').textContent==='已保存'");state=JSON.parse(fs.readFileSync(file));assert.equal(state.lineup_mode,'single');assert.equal(state.lineup_active,'subA');
    // All-mode editor saves a separate geometry profile; the old one survives.
    await fetch(server.base+'/api/d200/action/lineup_all',{method:'POST'});
    const editor=await cdp.page(server.base+'/titles/graphics.html?edit=1');await cdp.until(editor,"S.lineup_mode==='all'");
    await cdp.eval(editor,"saveEdit('lineup',{lineup_pos:{x:970,y:585},lineup_scale:.95})");
    state=JSON.parse(fs.readFileSync(file));assert.deepEqual(state.lineup_pos,{x:653,y:518});assert.equal(state.lineup_scale,.8);assert.deepEqual(state.lineup_all_pos,{x:970,y:585});assert.equal(state.lineup_all_scale,.95);
    // Exercise the actual change/click bindings and reproduce a scorebar near the top edge.
    await fetch(server.base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sb_pos:{x:1664,y:46},sb_scale:.73})});
    await cdp.eval(panel,"$('teamHome').value='尚未保存球队'");
    for(const period of ['上半场','下半场','加时赛','点球大战','中场休息','比赛结束']){
      await cdp.eval(panel,`$('period').value=${JSON.stringify(period)};$('period').dispatchEvent(new Event('change',{bubbles:true}));WRITE_QUEUE`);
      await cdp.until(page,`S.period===${JSON.stringify(period)} && $('sbPeriod').textContent===${JSON.stringify(period)}`);
      state=JSON.parse(fs.readFileSync(file));assert.equal(state.period,period);assert.equal(state.teamHome,'主队','Phase changes must not save other drafts');assert.equal(state.sb_clock_state.accMs,5400000,'Phase changes must not reset time');
    }
    for(const status of ['running','paused','running','half','running','over']){
      await cdp.eval(panel,`document.querySelector('[data-match-status="${status}"]').click();WRITE_QUEUE`);
      await cdp.until(page,`S.status==='${status}' && CB.running===${status==='running'}`);
      state=JSON.parse(fs.readFileSync(file));assert.equal(state.status,status);assert.equal(state.sb_clock_state.running,status==='running');assert(Math.abs(state.sb_clock_state.accMs-5400000)<60000,'State changes preserve the accumulated clock while countdown continues');
      assert.equal(await cdp.eval(panel,"document.querySelectorAll('[data-match-status][aria-pressed=true]').length"),1);
      assert.equal(await cdp.eval(panel,`document.querySelector('[data-match-status="${status}"]').getAttribute('aria-pressed')`),'true');
      if(status==='running')assert.equal(await cdp.eval(page,"$('sbBadge').classList.contains('show')"),false);
      else{
        assert.equal(await cdp.eval(page,"$('sbBadgeTx').textContent"),{paused:'比赛暂停',half:'中场休息',over:'比赛结束'}[status]);
        assert(await cdp.eval(page,"(()=>{var r=$('sbBadge').getBoundingClientRect();return $('sbBadge').classList.contains('in-bar')&&r.top>=0&&r.bottom<=1080&&r.left>=0&&r.right<=1920;})()"),'Status badge remains fully visible at the saved top-edge scorebar location');
      }
    }
    await cdp.send('Page.reload',{},panel);await cdp.until(panel,"document.querySelector('[data-match-status=over]').getAttribute('aria-pressed')==='true'");assert.equal(await cdp.eval(panel,"$('period').value"),'比赛结束');
    console.log('PASS actual phase change and status button bindings, clock start/pause without reset, draft preservation, current-state feedback, reload persistence and top-edge status badge visibility');
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
    console.log('PASS default full lineup, all four sections, team colors, aligned starters/subs, stable polling, saved layout profiles, seven wipes, configurable hold timing, long clock fit, reduced motion, manual clock controls, saved wipe settings and single/full controls');
  }finally{
    if(cdp)await cdp.send('Browser.close').catch(()=>{});if(browser&&!browser.killed)browser.kill();if(server)await stop(server.child);await delay(400);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-features-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
