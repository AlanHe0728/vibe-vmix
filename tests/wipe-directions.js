// Exercise visible mask geometry in real Edge with isolated Node/PowerShell state.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
const vertical=['clk','lineup'],horizontal=['rst','card','ply','goal','sub','logo'],all=[...vertical,...horizontal];
const logo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect width="120" height="100" fill="#e5eded"/><path d="M25 50h70M60 20v60" stroke="#263137" stroke-width="8"/></svg>');
const fixture={teamHome:'上海申花',teamAway:'北京国安',scoreHome:2,scoreAway:1,scoreboard_show:true,sb_pos:{x:440,y:140},
  clock_show:false,clock_mm:15,clock_mode:'down',clock_pos:{x:1540,y:500},clk_pos:{x:1540,y:500},
  lineup_show:false,lineup_mode:'all',lineup_all_pos:{x:690,y:555},lineup_all_scale:.78,
  xiH_team:'上海申花',xiA_team:'北京国安',xiH_color:'#c8102e',xiA_color:'#00529f',
  xiH_players:'1 颜骏凌\n2 蒋光太\n3 朱辰杰\n4 李磊\n5 张琳芃\n6 王上源\n7 武磊\n8 徐新\n9 张玉宁\n10 吴曦\n11 韦世豪',
  xiA_players:'1 韩佳琪\n2 马马杜\n3 恩加德乌\n4 李磊\n5 王刚\n6 池忠国\n7 林良铭\n8 张稀哲\n9 张玉宁\n10 古加\n11 曹永竞',
  subH_players:'12 刘殿座\n13 高准翼\n14 杨刘洋\n15 赵宏略',subA_players:'12 侯森\n13 江文豪\n14 方昊\n15 张源',
  sub_pos:{x:960,y:950},sub_off_num:'10',sub_off_name:'吴曦',sub_on_num:'12',sub_on_name:'刘殿座',sub_team:'上海申花',
  goal_name:'吴曦',goal_num:'10',card_name:'张玉宁',card_num:'9',player_name:'吴曦',player_num:'10',logo_show:false,logo_data:logo,
  wipe_in:.8,wipe_out:.4,animdur:1,motion:'linear',hold_sub:10};
// Convert computed inset(), including mixed calc(% +/- px), to actual mask bounds.
const measure=`id=>{
  var el=$(id),style=getComputedStyle(el),r=el.getBoundingClientRect(),parts=style.clipPath.match(/calc\\([^)]*\\)|[-+]?\\d*\\.?\\d+(?:px|%)/g);
  if(!parts)return {clip:style.clipPath,opacity:Number(style.opacity)};
  if(parts.length===1)parts=[parts[0],parts[0],parts[0],parts[0]];
  else if(parts.length===2)parts=[parts[0],parts[1],parts[0],parts[1]];
  else if(parts.length===3)parts.push(parts[1]);
  var val=(token,size)=>(token.replace(/\\s/g,'').match(/[-+]?\\d*\\.?\\d+(?:px|%)/g)||[]).reduce((sum,n)=>sum+parseFloat(n)*(n.endsWith('%')?size/100:1),0);
  var inset=parts.map((p,i)=>val(p,i%2?el.offsetWidth:el.offsetHeight));
  return {clip:style.clipPath,opacity:Number(style.opacity),inset,x:r.x,y:r.y,width:r.width,height:r.height,
    visibleWidth:el.offsetWidth-inset[1]-inset[3],visibleHeight:el.offsetHeight-inset[0]-inset[2],localWidth:el.offsetWidth,localHeight:el.offsetHeight};
}`;
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-wipe-directions-')),profile=path.join(temp,'edge');
  const out=path.resolve(__dirname,'../docs/screenshots'),file=path.join(temp,'state.json');let browser,cdp,server;
  try{
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);let ws;
    // DevToolsActivePort can be written just before its websocket accepts clients.
    for(let attempt=0;attempt<20;attempt++){
      ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
      try{await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});break;}
      catch(e){ws.close();if(attempt===19)throw Error('Edge DevTools websocket did not become ready on temporary port '+port);await delay(100);}
    }
    cdp=new CDP(ws);
    for(const kind of ['node','powershell']){
      fs.writeFileSync(file,JSON.stringify(fixture));server=await startServer(kind,file);
      const page=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(page,"S.teamHome==='上海申花'&&$('logoImg').complete");await delay(950);
      const saved=fs.readFileSync(file,'utf8');
      await cdp.eval(page,`window.maskMeasure=${measure};S.lineup_show=true;S.clock_show=true;S.logo_show=true;luApply();ckApply();logoApply();`);await delay(950);
      // Pause each entrance at 25%. Large panels retain full width; small strips retain full height.
      for(const id of all){
        const before=await cdp.eval(page,`maskMeasure('${id}')`);
        await cdp.eval(page,`hideGraphic('${id}',true);void $('${id}').offsetWidth;setGraphicVisible('${id}',true);void $('${id}').offsetWidth;window.maskAnim=$('${id}').getAnimations().find(a=>a.transitionProperty==='clip-path');if(!maskAnim)throw Error('Missing entrance ${id}');maskAnim.pause();maskAnim.currentTime=200;`);
        const mid=await cdp.eval(page,`maskMeasure('${id}')`);
        assert.equal(mid.opacity,1,id+' stays solid while its mask opens');
        assert.equal(mid.x,before.x);assert.equal(mid.y,before.y);assert.equal(mid.width,before.width);assert.equal(mid.height,before.height);
        if(vertical.includes(id)){
          assert(Math.abs(mid.inset[0]-mid.inset[2])<.1,id+' opens equally up and down');
          assert(mid.inset[0]>0&&mid.inset[1]<0&&mid.inset[3]<0,id+' has a horizontal central reveal');
          assert(mid.visibleHeight/mid.localHeight>.24&&mid.visibleHeight/mid.localHeight<.55,id+' is partly revealed vertically');
        }else{
          assert(Math.abs(mid.inset[1]-mid.inset[3])<.1,id+' opens equally left and right');
          assert(mid.inset[1]>0&&mid.inset[0]<0&&mid.inset[2]<0,id+' has a vertical central reveal');
          assert(mid.visibleWidth/mid.localWidth>.24&&mid.visibleWidth/mid.localWidth<.55,id+' is partly revealed horizontally');
        }
        await cdp.eval(page,'maskAnim.finish()');
        assert.equal(await cdp.eval(page,`getComputedStyle($('${id}')).clipPath`),'inset(-12px)','Open mask leaves room for shadows');
        await cdp.eval(page,`hideGraphic('${id}');void $('${id}').offsetWidth;window.maskAnim=$('${id}').getAnimations().find(a=>a.transitionProperty==='clip-path');if(!maskAnim)throw Error('Missing exit ${id}');maskAnim.pause();maskAnim.currentTime=200;`);
        const exit=await cdp.eval(page,`maskMeasure('${id}')`);assert.equal(exit.opacity,1,id+' does not disappear before exit finishes');
        assert(vertical.includes(id)?exit.inset[0]>0&&exit.inset[1]<0:exit.inset[1]>0&&exit.inset[0]<0,id+' closes on its own axis');
        await cdp.eval(page,`$('${id}').getAnimations().forEach(a=>a.finish())`);assert.equal(await cdp.eval(page,`getComputedStyle($('${id}')).opacity`),'0');
        await cdp.eval(page,`setGraphicVisible('${id}',true)`);await delay(850);
        await cdp.eval(page,`replayWipe('${id}');WIPES['${id}'].pause();WIPES['${id}'].currentTime=wipeSeconds('out')*1000+200`);
        const replay=await cdp.eval(page,`maskMeasure('${id}')`);assert(Math.abs(replay.inset[0]-mid.inset[0])<.1&&Math.abs(replay.inset[1]-mid.inset[1])<.1,id+' repeated entrance uses the same direction');
        // Hide halfway through replay, then reopen halfway through that exit.
        await cdp.eval(page,`hideGraphic('${id}');WIPES['${id}'].pause();WIPES['${id}'].currentTime=0`);
        const closing=await cdp.eval(page,`maskMeasure('${id}')`);assert(Math.abs(closing.inset[0]-replay.inset[0])<.1&&Math.abs(closing.inset[1]-replay.inset[1])<.1,id+' hide continues from its visible mask');
        await cdp.eval(page,`WIPES['${id}'].currentTime=200;window.closingMask=maskMeasure('${id}');setGraphicVisible('${id}',true);WIPES['${id}'].pause();WIPES['${id}'].currentTime=0`);
        assert(await cdp.eval(page,`Math.abs(maskMeasure('${id}').inset[0]-closingMask.inset[0])<.1&&Math.abs(maskMeasure('${id}').inset[1]-closingMask.inset[1])<.1`),id+' reopening does not flash the full panel');
        await cdp.eval(page,`WIPES['${id}'].finish();hideGraphic('${id}',true)`);assert.equal(await cdp.eval(page,`getComputedStyle($('${id}')).opacity`),'0');
      }
      // Unchanged scorebar entry is still a one-sided horizontal wipe with a fade.
      await cdp.eval(page,"hideGraphic('sb',true);void $('sb').offsetWidth;$('sb').classList.add('on');void $('sb').offsetWidth;$('sb').getAnimations().forEach(a=>{a.pause();a.currentTime=200;})");
      const score=await cdp.eval(page,"maskMeasure('sb')");assert(score.inset[1]>0&&score.inset[3]===-12&&score.inset[0]===-48);assert(score.opacity>0&&score.opacity<1);await cdp.eval(page,"$('sb').getAnimations().forEach(a=>a.finish())");
      // Normal clock ticks and repeated roster polling must never restart a reveal.
      await cdp.eval(page,"S.clock_show=true;S.lineup_show=true;ckApply();luApply()");await delay(900);
      assert(await cdp.eval(page,"window.rosterRow=$('lineupAll').querySelector('.lu-row');for(var i=0;i<8;i++){ckApply();ckTick();luApply()}rosterRow===$('lineupAll').querySelector('.lu-row')&&['clk','lineup'].every(id=>$(id).getAnimations().every(a=>a.playState!=='running'))"));
      for(const mode of ['single','all']){await cdp.eval(page,`S.lineup_mode='${mode}';luApply();WIPES.lineup.pause();WIPES.lineup.currentTime=wipeSeconds('out')*1000+200`);assert(await cdp.eval(page,"maskMeasure('lineup').inset[0]>0&&maskMeasure('lineup').inset[1]<0"));await cdp.eval(page,'WIPES.lineup.finish()');}
      // Apple smooth starts at rest, accelerates, and gradually settles without bounce.
      await cdp.eval(page,"S.motion='smooth';applyTheme();hideGraphic('clk',true);void $('clk').offsetWidth;setGraphicVisible('clk',true);void $('clk').offsetWidth;window.springAnim=$('clk').getAnimations().find(a=>a.transitionProperty==='clip-path');springAnim.pause()");
      const samples=[];
      for(const time of [0,8,80,160,320,640,720,792,800]){
        samples.push(await cdp.eval(page,`springAnim.currentTime=${time};(()=>{var m=maskMeasure('clk');return m.visibleHeight/(m.localHeight+24)})()`));
      }
      assert(samples.every((v,i)=>v>=-.00001&&v<=1.00001&&(i===0||v>=samples[i-1])),'Smooth spring is monotonic and bounded, with no bounce');
      assert(samples[1]<.008,'Smooth starts gently rather than jumping in velocity');
      assert(samples[3]-samples[2]>samples[2]-samples[0],'First phase accelerates');
      assert(1-samples[6]<.02&&samples[5]>.98,'Long gradual tail settles into readable full content');
      assert(Math.abs(samples[8]-1)<.0001);
      await cdp.eval(page,"springAnim.finish();replayWipe('clk');WIPES.clk.pause();WIPES.clk.currentTime=0");
      assert(await cdp.eval(page,"maskMeasure('clk').inset.every(v=>Math.abs(v+12)<.001)"),'Repeated smooth reveal starts at the actual visible mask');
      await cdp.eval(page,"WIPES.clk.currentTime=wipeSeconds('out')*1000");assert(await cdp.eval(page,"Math.abs(maskMeasure('clk').visibleHeight)<.1"),'Repeated reveal closes smoothly before opening');
      await cdp.eval(page,"WIPES.clk.currentTime=(wipeSeconds('out')+wipeSeconds('in'))*1000;WIPES.clk.finish();S.motion='linear';applyTheme()");
      console.log('PASS '+kind+': nonlinear smooth spring, slow start, acceleration, gradual tail, no bounce and continuous close-then-reveal');
      // Actual repeated substitution ticks, event collision and entrance+hold timing.
      await cdp.eval(page,"OVERLAP.forEach(id=>{if(AUTO[id])clearTimeout(AUTO[id]);hideGraphic(id,true)});S.hold_sub=.2;S.sub_pos={x:960,y:950};S.goal_pos={x:960,y:950};applyState(Object.assign({},S,{sub_tick:100,sub_trigger:'show'}),false);applyState(Object.assign({},S,{sub_tick:101,sub_trigger:'show'}),false);WIPES.sub.pause();WIPES.sub.currentTime=200");
      assert(await cdp.eval(page,"maskMeasure('sub').inset[1]>0"));await cdp.eval(page,'goalShow()');assert.equal(await cdp.eval(page,"getComputedStyle($('sub')).opacity"),'0','Overlapping old event is removed immediately');
      await cdp.eval(page,"hideGraphic('goal',true);clearTimeout(AUTO.goal);hideGraphic('sub',true);subShow()");await delay(900);assert(await cdp.eval(page,"$('sub').classList.contains('on')"));await delay(650);assert.equal(await cdp.eval(page,"$('sub').classList.contains('on')"),false);
      if(kind==='node'){
        await cdp.eval(page,"S.motion='smooth';applyTheme();document.body.style.background='repeating-linear-gradient(90deg,#205639 0 160px,#255e3e 160px 320px)';S.sub_pos={x:960,y:950};applyPos('sub','sub');subShow();clearTimeout(AUTO.sub);['clk','lineup','sub'].forEach(id=>setGraphicVisible(id,true));hideGraphic('goal',true);hideGraphic('logo',true)");await delay(900);
        await cdp.eval(page,"['clk','lineup','sub'].forEach(replayWipe)");
        for(const progress of [.02,.25,1]){
          await cdp.eval(page,`['clk','lineup','sub'].forEach(id=>{WIPES[id].pause();WIPES[id].currentTime=(wipeSeconds('out')+${progress}*wipeSeconds('in'))*1000;})`);
          const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},page);fs.writeFileSync(path.join(out,'broadcast-wipe-'+progress+'.png'),Buffer.from(shot.data,'base64'));
        }
      }
      await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},page);
      await cdp.eval(page,"allMotionIds=['clk','lineup','rst','card','ply','goal','sub','logo'];allMotionIds.forEach(id=>{hideGraphic(id,true);setGraphicVisible(id,true);replayWipe(id);})");
      assert(await cdp.eval(page,"allMotionIds.every(id=>getComputedStyle($(id)).clipPath==='none'&&getComputedStyle($(id)).opacity==='1'&&$(id).getAnimations().length===0)"),'Reduced motion is visible immediately');
      await cdp.eval(page,'allMotionIds.forEach(hideGraphic)');assert(await cdp.eval(page,"allMotionIds.every(id=>getComputedStyle($(id)).opacity==='0')"),'Reduced motion also hides immediately');
      const editor=await cdp.page(server.base+'/titles/graphics.html?edit=1');await cdp.until(editor,"S.teamHome==='上海申花'&&EDIT");
      assert(await cdp.eval(editor,"['clk','lineup','rst','card','ply','goal','sub','logo'].every(id=>{var s=getComputedStyle($(id));return s.clipPath==='none'&&s.opacity==='1'&&s.transitionDuration==='0s';})"),'Editor remains unmasked and still');
      assert.equal(fs.readFileSync(file,'utf8'),saved,'Wipe rendering never writes the match state');
      assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
      console.log('PASS '+kind+': center-out vertical/horizontal entry, reverse exit, repeated ticks, interrupt/reopen continuity, hold timing, stable rosters/clocks, unchanged scorebar, reduced motion and editor geometry');
      for(const session of [page,editor]){const info=await cdp.send('Target.getTargetInfo',{},session);await cdp.send('Target.closeTarget',{targetId:info.targetInfo.targetId});}
      await stop(server.child);server=null;
    }
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-wipe-directions-'))throw Error('Unsafe cleanup');await delay(500);fs.rmSync(temp,{recursive:true,force:true,maxRetries:20,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
