// Real file imports and saved uploads, always with isolated match data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const format=require('../control/roster-format'),XLSX=require('../control/vendor/xlsx.full.min'),{CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==';
function unit(){
  for(const s of ['1 张三','1-张三','1+张三','1号张三','1张三','1：张三','1、张三','#1 张三','No.1 张三','１号张三'])assert.deepEqual([format.line(s).num,format.line(s).name],['1','张三']);
  for(const s of ['2026年球队名单','1-0','姓名','1号','1 123'])assert.equal(format.line(s),null);
  assert.equal(format.text('号码,姓名\r\n10,"Messi (C)"\r\n7,德保罗').text,'10 Messi (C)\n7 德保罗');
  assert.equal(format.text('1-颜骏凌\n10+吴曦\n9号马丁斯').text,'1 颜骏凌\n10 吴曦\n9 马丁斯');
  assert.equal(format.rows([['序号','姓名','球衣号码','位置'],[1,'梅西',10,'前锋']]).text,'10 梅西 (前锋)');
  assert.equal(format.rows([[1,10,'梅西']]).text,'10 梅西');
  console.log('PASS flexible separators, joined names, full-width numbers, captain marks, reordered headers and non-roster rows');
}
async function main(){
  unit();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-imports-')),profile=path.join(temp,'edge'),out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(out,{recursive:true});
  const font=fs.readFileSync('C:/Windows/Fonts/arial.ttf'),png=Buffer.from(pixel.split(',')[1],'base64');
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['比赛报名表']]),'说明');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['序号','姓名','号码','位置'],[1,'梅西 (C)',10,'前锋'],[2,'颜骏凌','1号','门将']]),'首发');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['12+迪马利亚'],['2-蒙铁尔']]),'替补');
  const fixture={teamHome:'测试主队',teamAway:'测试客队',xiH_players:'10号梅西 (C)\n１-颜骏凌',subH_players:'12+迪马利亚',xiA_players:'9号姆巴佩',lineup_show:true,lineup_mode:'all',homeLogo:pixel,font_data:'data:font/ttf;base64,'+font.toString('base64'),font_family:'CustomFont'};
  let browser,cdp,server;const bases=[];
  try{
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-background-timer-throttling','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active),'Edge did not start');
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});cdp=new CDP(ws);
    for(const kind of ['node','powershell']){
      console.log('CHECK '+kind+' import panel');
      const file=path.join(temp,kind+'.json');fs.writeFileSync(file,JSON.stringify(fixture));server=await startServer(kind,file);bases.push(server.base);
      const panel=await cdp.page(server.base+'/control/panel.html');await cdp.send('Page.bringToFront',{},panel);
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false},panel);
      await cdp.until(panel,"$('homeLogoFileInfo').textContent==='已保存主队队徽'");
      assert(await cdp.eval(panel,"$('fontFileInfo').textContent.includes('已保存自定义字体')"),'Existing uploads without old filename metadata are still shown');
      assert(await cdp.eval(panel,"['homeLogoFile','awayLogoFile','logoFile','bgFile','fontFile'].every(id=>$(id).hidden&&$(id).parentElement.querySelector('.asset-pick').textContent==='选择文件')"),'Native file labels are replaced with a single localized picker button');
      assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(fixture),'Opening saved uploads does not change user data');
      await cdp.eval(panel,"selectPanelTab('lineups',true);$('homeLogoFile').parentElement.querySelector('.asset-pick').scrollIntoView({block:'center'})");await cdp.send('Page.setInterceptFileChooserDialog',{enabled:true},panel);
      const pickerPoint=await cdp.eval(panel,"(()=>{var b=$('homeLogoFile').parentElement.querySelector('.asset-pick'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...pickerPoint,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);await delay(80);assert(cdp.events.some(e=>e.sessionId===panel&&e.method==='Page.fileChooserOpened'),'Localized button opens the real file picker');await cdp.send('Page.setInterceptFileChooserDialog',{enabled:false},panel);
      const status=await (await fetch(server.base+'/api/d200/status')).json();assert.deepEqual(status.onfield.home,['home|10|梅西','home|1|颜骏凌'],'Backend recognizes the same flexible roster identities');
      await cdp.eval(panel,"$('goal_num').value='１号';$('goal_num').dispatchEvent(new Event('input',{bubbles:true}))");assert.equal(await cdp.eval(panel,"$('goal_name').value"),'颜骏凌');
      const viewer=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(viewer,"$('lineupAll').querySelector('[data-player=\"home|10|梅西\"]')");
      assert.equal(await cdp.eval(viewer,"$('lineupAll').querySelector('[data-player=\"home|10|梅西\"] .lu-cap').classList.contains('show')"),true);
      async function load(id,name,bytes,type){await cdp.eval(panel,`(()=>{var data=Uint8Array.from(atob(${JSON.stringify(Buffer.from(bytes).toString('base64'))}),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([data],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));$('${id}').files=dt.files;$('${id}').dispatchEvent(new Event('change',{bubbles:true}));})()`);}
      for(const [prefix,extension,bookType] of [['xiH','xlsx','xlsx'],['xiA','xlsx','xlsx'],['subH','xls','biff8'],['subA','xlsm','xlsm']]){
        await load(prefix+'_import','名单.'+extension,XLSX.write(workbook,{type:'buffer',bookType}),'application/octet-stream');
        await cdp.until(panel,`$('${prefix}_players').value==='10 梅西 (前锋) (C)'+String.fromCharCode(10)+'1 颜骏凌 (GK)'`);
        assert.equal(await cdp.eval(panel,`$('${prefix}_sheets').hidden`),false);assert.equal(await cdp.eval(panel,`$('${prefix}_sheet').options[0].disabled`),true);
        if(prefix.startsWith('sub'))await cdp.eval(panel,`$('${prefix}_sheet').value='2';$('${prefix}_sheet').dispatchEvent(new Event('change',{bubbles:true}));`);
      }
      assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(fixture),'Excel imports remain unsaved drafts');
      const imported=await cdp.eval(panel,"$('xiH_players').value");await load('xiH_import','坏文件.xlsx',Buffer.from([0,1,255,22]),'application/octet-stream');await cdp.until(panel,"$('xiH_import').value===''");assert.equal(await cdp.eval(panel,"$('xiH_players').value"),imported,'Unreadable Excel cannot replace an existing roster');
      await cdp.eval(panel,'lineupAllWrite(false);WRITE_QUEUE');assert.equal(JSON.parse(fs.readFileSync(file)).xiH_players,imported);
      await cdp.eval(panel,"$('sub_off_num').value='10';$('sub_off_num').dispatchEvent(new Event('input',{bubbles:true}));$('sub_on_num').value='12';$('sub_on_num').dispatchEvent(new Event('input',{bubbles:true}));executeSubstitution()");
      await cdp.until(panel,"Array.from($('sub_off_player').options).some(o=>o.value==='home|12|迪马利亚')");assert(JSON.parse(fs.readFileSync(file)).onfield_home.includes('home|12|迪马利亚'),'Imported player identities still support atomic substitutions');
      for(const [id,key,name,data,type] of [['homeLogoFile','homeLogo','主队.png',png,'image/png'],['awayLogoFile','awayLogo','客队.png',png,'image/png'],['logoFile','logo_data','赛事角标.png',png,'image/png'],['bgFile','theme_bg','球场.png',png,'image/png'],['fontFile','font_data','转播字体.ttf',font,'font/ttf']]){
        await load(id,name,data,type);await cdp.until(panel,`$('${id}Info').textContent===${JSON.stringify(name)}`);assert.equal(JSON.parse(fs.readFileSync(file))[key+'_filename'],name);
      }
      await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('fontFileInfo').textContent==='转播字体.ttf'");
      assert.deepEqual(await cdp.eval(panel,"['homeLogoFile','awayLogoFile','logoFile','bgFile','fontFile'].map(id=>$(id+'Info').textContent)"),['主队.png','客队.png','赛事角标.png','球场.png','转播字体.ttf']);
      for(const width of [1440,390,320]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false},panel);
        for(const [tab,ids] of [['lineups',['homeLogoFile','awayLogoFile']],['appearance',['logoFile','bgFile','fontFile']]]){
          await cdp.eval(panel,`selectPanelTab('${tab}',true)`);
          for(const id of ids)assert(await cdp.eval(panel,`(()=>{var input=$('${id}'),host=input.parentElement,info=$('${id}Info'),button=host.querySelector('.asset-pick'),text=info.textContent;info.textContent='这是一个很长的中文队徽或字体文件名-2026-最终确认版本.png';var a=button.getBoundingClientRect(),b=info.getBoundingClientRect(),r=host.getBoundingClientRect(),ok=getComputedStyle(input).display==='none'&&b.left>=a.right+8&&b.right<=r.right&&getComputedStyle(info).textOverflow==='ellipsis';info.textContent=text;return ok;})()`),width+' upload filename overlaps '+id);
          assert(await cdp.eval(panel,'document.documentElement.scrollWidth<=innerWidth'),width+' upload layout overflow');
        }
      }
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false},panel);
      assert(await cdp.eval(panel,"$('homeLogoFilePreview').querySelector('img').src.startsWith('data:image/png')"));
      await cdp.eval(panel,'writeTheme();WRITE_QUEUE');assert.equal(JSON.parse(fs.readFileSync(file)).theme_bg,pixel,'Applying colors/fonts retains the already-uploaded background image');
      const saved=fs.readFileSync(file,'utf8');await cdp.eval(panel,"window.savedFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return savedFetch(url,opt);}");
      await load('fontFile','未保存.ttf',font,'font/ttf');await cdp.until(panel,"$('writeStatus').textContent.includes('保存失败')&&$('fontFileInfo').textContent==='转播字体.ttf'");assert.equal(fs.readFileSync(file,'utf8'),saved,'Failed uploads do not masquerade as saved files');await cdp.eval(panel,'window.fetch=savedFetch');
      await cdp.eval(panel,"clearLogoKey('homeLogo');WRITE_QUEUE");assert.equal(await cdp.eval(panel,"$('homeLogoFileInfo').textContent"),'未上传');assert.equal(await cdp.eval(panel,"$('homeLogoFilePreview').hidden"),true);
      if(kind==='node'){
        await cdp.send('Page.bringToFront',{},panel);await cdp.eval(panel,"selectPanelTab('appearance',true);window.scrollTo(0,0)");await delay(150);
        const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);fs.writeFileSync(path.join(out,'control-saved-assets.png'),Buffer.from(screenshot.data,'base64'));
        await cdp.eval(panel,"selectPanelTab('lineups',true);window.scrollTo(0,0)");await delay(150);const rosterShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);fs.writeFileSync(path.join(out,'control-excel-import.png'),Buffer.from(rosterShot.data,'base64'));
      }
      for(const asset of ['vendor/xlsx.full.min.js','roster-format.js','panel-assets.js']){const response=await fetch(server.base+'/control/'+asset);assert.equal(response.status,200);await response.arrayBuffer();}
      const targets=await cdp.send('Target.getTargets');for(const t of targets.targetInfos.filter(t=>t.type==='page'&&t.url.startsWith(server.base+'/')))await cdp.send('Target.closeTarget',{targetId:t.targetId});
      await stop(server.child);server=null;
      console.log('CHECK '+kind+' saved uploads after restart');
      server=await startServer(kind,file);bases.push(server.base);const reopened=await cdp.page(server.base+'/control/panel.html');await cdp.until(reopened,"$('fontFileInfo').textContent==='转播字体.ttf'");assert.equal(await cdp.eval(reopened,"$('logoFileInfo').textContent"),'赛事角标.png');
      const freshTargets=await cdp.send('Target.getTargets');for(const t of freshTargets.targetInfos.filter(t=>t.type==='page'&&t.url.startsWith(server.base+'/')))await cdp.send('Target.closeTarget',{targetId:t.targetId});await stop(server.child);server=null;
      console.log('PASS '+kind+' xlsx/xls/xlsm sheet selection, bad-file preservation, typed numbers, on-air captain and substitutions, saved upload names/previews, failed uploads, clear, refresh and server restart');
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
    assert.equal(cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)&&!bases.some(base=>e.params.request.url.startsWith(base+'/'))).length,0,'No external runtime requests');
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-imports-'))throw Error('Unsafe cleanup');await delay(500);fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
