// Edit and import the total roster through real pointer events; never use live match data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-roster-editor-')),profile=path.join(temp,'edge'),real=path.resolve(__dirname,'../control/state.json'),original=fs.existsSync(real)?fs.readFileSync(real):null;
  let browser,cdp,server;
  try{
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--window-size=1920,1080','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});cdp=new CDP(ws);
    for(const backend of process.platform==='win32'?['node','powershell']:['node']){
      const file=path.join(temp,backend+'.json');fs.writeFileSync(file,JSON.stringify({teamHome:'测试主队',teamAway:'测试客队',scoreHome:2,scoreAway:1,period:'下半场',xiH_players:'1 门将 (GK) (C)\n7 前锋 (FW)',subH_players:'12 替补',xiA_players:'1 客门将 (GK)\n9 客前锋',subA_players:'20 客替补',goal_tick:0,sub_tick:0}));
      server=await startServer(backend,file);const panel=await cdp.page(server.base+'/control/panel.html');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);await cdp.send('Page.bringToFront',{},panel);await cdp.until(panel,"!$('topClockToggle').disabled&&$('squad_home_rows').querySelectorAll('.squad-row').length===3");
      async function click(selector){
        await cdp.eval(panel,`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
        const point=await cdp.eval(panel,`(()=>{var b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!b.contains(document.elementFromPoint(x,y)))throw Error('Obscured '+${JSON.stringify(selector)});return {x,y};})()`);
        for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
      }
      const value=(id,v)=>cdp.eval(panel,`$(${JSON.stringify(id)}).value=${JSON.stringify(v)}`),read=()=>JSON.parse(fs.readFileSync(file));
      const row=(side,id)=>`#squad_${side}_rows [data-player=${JSON.stringify(side+'|'+id)}]`;
      await click('#tab-lineups');const before=fs.readFileSync(file,'utf8');
      for(const side of ['home','away'])assert(await cdp.eval(panel,`$('squad_${side}_file').closest('details')===$('squad_${side}_paste').closest('details')&&$('squad_${side}_importer').querySelectorAll('details').length===0`),'File and paste share a single importer');
      await click('#squad_home_importer>summary');await value('squad_home_paste','1号门将 (GK) (C)\n7-前锋 (FW)\n12+替补\n15 新后卫 (DF)');await click('#squad_home_read');await cdp.until(panel,"$('squad_home_rows').querySelectorAll('.squad-row').length===4");await click('#squad_home_importer>summary');
      assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),2,'Import preserves matching starters');
      await click(row('home','1|门将')+' [data-role=goalkeeper]');await click(row('home','1|门将')+' [data-role=captain]');
      await click(row('home','12|替补')+' [data-role=goalkeeper]');await click(row('home','7|前锋')+' [data-role=captain]');
      await click(row('home','7|前锋')+' [data-role=goalkeeper]');await click(row('home','7|前锋')+' [data-role=goalkeeper]');
      assert(await cdp.eval(panel,"$('xiH_players').value.includes('7 前锋 (FW) (C)')&&!$('xiH_players').value.includes('1 门将 (GK)')&&$('subH_players').value.includes('12 替补 (GK)')"),'Roles can be reassigned while preserving positions');
      assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),2,'Role buttons never toggle starters');
      await click('#squad_home_add');await value('squad_home_num','abc');await value('squad_home_name','新增球员');await click('#squad_home_add_form button[type=submit]');assert(await cdp.eval(panel,"$('squad_home_edit_status').textContent.includes('1 至 3 位')"));
      await value('squad_home_num','1');await value('squad_home_name','门将');await click('#squad_home_add_form button[type=submit]');assert(await cdp.eval(panel,"$('squad_home_edit_status').textContent.includes('已有这位球员')"));
      await value('squad_home_num','１８');await value('squad_home_name','新门将');await value('squad_home_position','GK');await cdp.eval(panel,"$('squad_home_captain').checked=true");await click('#squad_home_add_form button[type=submit]');
      assert(await cdp.eval(panel,"$('subH_players').value.includes('18 新门将 (GK) (C)')"));assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),2,'New players start as substitutes');
      await click('#squad_home_cancel');await click(row('home','18|新门将')+' .squad-select');assert(await cdp.eval(panel,"$('xiH_players').value.includes('18 新门将 (GK) (C)')"));
      await click(row('home','18|新门将')+' .squad-delete');assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('.squad-row').length"),4);assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),2,'Delete does not toggle another starter');
      await click(row('home','7|前锋')+' .squad-select');await click('#squad_home_undo');assert.equal(await cdp.eval(panel,"$('squad_home_rows').querySelectorAll('input:checked').length"),2,'Undo retains other selection changes');assert(await cdp.eval(panel,"$('xiH_players').value.includes('18 新门将 (GK) (C)')"));
      await click(row('home','15|新后卫')+' .squad-delete');await click(row('away','20|客替补')+' .squad-delete');
      assert.equal(fs.readFileSync(file,'utf8'),before,'Import, add, delete, undo, and XI selection are drafts');
      await cdp.eval(panel,"window.realFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return realFetch(url,opt);};");await click('#squadSave');await cdp.until(panel,"$('squadStatus').textContent.startsWith('保存失败')");assert.equal(fs.readFileSync(file,'utf8'),before);assert(await cdp.eval(panel,"$('xiH_players').value.includes('新门将')&&!$('subH_players').value.includes('新后卫')"));await cdp.eval(panel,'window.fetch=realFetch');
      await click('#squadSave');await cdp.until(panel,"$('squadStatus').textContent.startsWith('双方首发与替补已保存')");const saved=read();assert(saved.xiH_players.includes('18 新门将 (GK) (C)'));assert(saved.subH_players.includes('7 前锋 (FW)'));assert(!saved.subH_players.includes('新后卫'));assert(!saved.subA_players.includes('客替补'));assert.deepEqual(saved.onfield_home,['home|1|门将','home|18|新门将']);assert.equal(saved.goal_tick,0);assert.equal(saved.sub_tick,0);
      await cdp.send('Page.reload',{},panel);await cdp.until(panel,"!$('topClockToggle').disabled&&$('squad_home_rows').querySelectorAll('.squad-row').length===4");assert(await cdp.eval(panel,"Array.from($('goal_roster_player').options).some(o=>o.textContent.includes('18')&&o.textContent.includes('新门将'))"));assert(await cdp.eval(panel,"!Array.from($('goal_roster_player').options).some(o=>o.textContent.includes('新后卫'))"));
      assert.equal(await cdp.eval(panel,`document.querySelector(${JSON.stringify(row('home','1|门将')+' [data-role=goalkeeper]')}).getAttribute('aria-pressed')`),'false');
      assert.equal(await cdp.eval(panel,`document.querySelector(${JSON.stringify(row('home','12|替补')+' [data-role=goalkeeper]')}).getAttribute('aria-pressed')`),'true');assert(read().subH_players.includes('7 前锋 (FW) (C)'));
      // Verify actual geometry, including all six action footers and narrow layouts.
      for(const width of [1440,1024,820,620,390,320]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},panel);
        for(const task of ['goal','card','sub','player','restart','timer']){
          await cdp.eval(panel,`FBPDesk.task('${task}')`);assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),width+' event overflow '+task);
          assert(await cdp.eval(panel,`(()=>{var root=document.querySelector('#event-${task} .event-actions'),a=root.firstElementChild.getBoundingClientRect(),b=root.lastElementChild.getBoundingClientRect(),r=root.getBoundingClientRect();return Math.abs((a.left+b.right)/2-(r.left+r.width/2))<2;})()`),width+' action group centered '+task);
        }
        if(width>=1024)assert(await cdp.eval(panel,"Math.abs($('scoreEditButton').getBoundingClientRect().left+$('scoreEditButton').getBoundingClientRect().width/2-innerWidth/2)<2"),'Score remains on the page center');
        await cdp.eval(panel,"selectPanelTab('lineups');$('squad_home_importer').open=true");await click('#squad_home_add');assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),width+' expanded roster editor overflow');await click('#squad_home_cancel');await cdp.eval(panel,"$('squad_home_importer').open=false");
      }
      // Capture desktop/mobile in one bounded inspection round, using synthetic data.
      if(backend==='node'){
        const out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(out,{recursive:true});
        for(const [name,width,setup] of [
          ['control-balanced-desktop',1440,"FBPDesk.task('sub');window.scrollTo(0,0)"],
          ['control-balanced-mobile',390,"FBPDesk.task('sub');window.scrollTo(0,0)"],
          ['control-roster-editor-desktop',1440,"selectPanelTab('lineups');$('squad_home_importer').open=true;$('squad_away_importer').open=true;$('squadPicker').scrollIntoView({block:'start'})"],
          ['control-roster-editor-mobile',390,"selectPanelTab('lineups');$('squad_home_importer').open=false;$('squad_away_importer').open=false;$('squadPicker').scrollIntoView({block:'start'});FBPRosterPicker.refresh();$('squad_home_add').click()"]
        ]){
          const screen=await cdp.page(server.base+'/control/panel.html');await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},screen);await cdp.send('Page.bringToFront',{},screen);await cdp.until(screen,"!$('topClockToggle').disabled&&$('squad_home_rows').querySelectorAll('.squad-row').length===4");await cdp.eval(screen,setup);await cdp.eval(screen,'document.fonts.ready');await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0},screen);await delay(350);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},screen);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));const info=await cdp.send('Target.getTargetInfo',{},screen);await cdp.send('Target.closeTarget',{targetId:info.targetInfo.targetId});
        }
      }
      console.log('PASS '+backend+' unified imports, validated add, separate delete, non-destructive undo, draft/failed/successful save, GK/captain, reload/linked pickers, centered footers and 320–1440 layouts');await stop(server.child);server=null;
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,JSON.stringify(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown')));assert.deepEqual(fs.existsSync(real)?fs.readFileSync(real):null,original,'Live custom data untouched');
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(250);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);await delay(300);if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('fbp-roster-editor-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
