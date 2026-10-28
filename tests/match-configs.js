// Round-trip real TXT downloads/uploads against temporary Node and PowerShell states.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const format=require('../control/roster-format'),config=require('../control/match-config'),{CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGQAAAABJRU5ErkJggg==';
const fixture={teamHome:'主队甲',teamAway:'客队甲',colorHome:'#BD2040',colorAway:'#135AA5',scoreHome:3,scoreAway:1,status:'halftime',period:'下半场',sb_clockacc:420000,sb_clockrun:0,sb_pos:{x:500,y:140},theme_skin:'glass',theme_font:'system-ui',
  homeLogo:pixel,homeLogo_filename:'主队.png',awayLogo:pixel,awayLogo_filename:'客队.png',xiH_players:'1 张三 (GK) (C)\n10 李四 (中场)',subH_players:'12 球员乙 (后卫)',xiA_players:'1 王五 (门将)\n9 球员丁 (前锋)',subA_players:'13 球员戊 (守门员)',
  onfield_home:['home|1|张三','home|12|球员乙'],lineup_show:true,lineup_mode:'all',goal_tick:30,goal_trigger:'goal',goal_side:'away',goal_team:'客队甲',goal_name:'旧球员',goal_num:'9',player_side:'home'};
function unit(){
  for(const line of ['１号张三 (GK) (C)','1-张三（队长）【守门员】','1+张三 (门将)*','1 张三 GK (C)','1 张三 [位置:门将] (C)']){
    const p=format.line(line);assert.equal(p.name,'张三');assert(p.captain&&p.goalkeeper);assert.equal(p.position,'GK');
  }
  assert.equal(format.line('10 Alex (Junior)').name,'Alex (Junior)');
  const cells=format.rows([['号码','姓名','位置','队长'],['1','张三','门将','是'],['10','李四','中场','否']]);
  assert.equal(cells.text,'1 张三 (GK) (C)\n10 李四 (中场)');
  assert.equal(format.rows([['号码','姓名','位置'],['10','李四','队长']]).text,'10 李四 (C)');
  const a=config.fromState(fixture),b=config.parse('\uFEFF'+config.stringify(a));assert.deepEqual(a,b);assert(b.teams.home.starters[0].goalkeeper&&b.teams.home.starters[0].captain);assert.equal(b.teams.home.logo.filename,'主队.png');
  const patch=config.toPatch(b,fixture);assert.deepEqual(patch.onfield_home,['home|1|张三','home|10|李四']);assert.equal(patch.goal_team,'客队甲');
  assert(!Object.keys(patch).some(k=>/tick|trigger|clock|score|_pos$|_show$|theme/.test(k)&&k!=='player_pos'));
  assert.throws(()=>config.parse('{bad'),/格式/);assert.throws(()=>config.parse(JSON.stringify({...a,version:9})),/版本/);
  const bad=JSON.parse(JSON.stringify(a));bad.teams.home.logo.data='file:///private/logo.png';assert.throws(()=>config.parse(JSON.stringify(bad)),/内嵌/);
  assert.throws(()=>config.fromState({...fixture,xiH_players:'无法识别的一行'}),/第1行/);
  console.log('PASS metadata recognition, Excel positions/GK/captain, portable embedded logos, version validation and patch scope');
}
async function main(){
  unit();const realFile=path.resolve(__dirname,'../control/state.json'),hash=()=>fs.existsSync(realFile)?crypto.createHash('sha256').update(fs.readFileSync(realFile)).digest('hex'):null,originalHash=hash();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-match-configs-')),profile=path.join(temp,'edge');let browser,cdp,server;
  try{
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-background-timer-throttling','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert(fs.existsSync(active));
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});cdp=new CDP(ws);
    for(const kind of process.platform==='win32'?['node','powershell']:['node']){
      const file=path.join(temp,kind+'.json'),downloads=path.join(temp,kind+'-downloads');fs.mkdirSync(downloads);fs.writeFileSync(file,JSON.stringify(fixture));server=await startServer(kind,file);
      const read=async()=>await(await fetch(server.base+'/state.json')).json(),post=async(p)=>{const r=await fetch(server.base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});assert.equal(r.status,200,await r.clone().text());};
      const initial=await read(),panel=await cdp.page(server.base+'/control/panel.html');await cdp.until(panel,"!$('matchConfigExport').disabled && $('homeLogoFileInfo').textContent==='主队.png'");await cdp.eval(panel,"selectPanelTab('lineups',true);window.scrollTo(0,0)");
      assert(await cdp.eval(panel,"$('matchConfigFile').getClientRects().length===0"),'Native file input stays hidden behind the import button');
      const backend=await(await fetch(server.base+'/api/d200/status')).json();assert.deepEqual(backend.onfield.home,fixture.onfield_home);
      await cdp.eval(panel,"$('player_num').value='1';$('player_num').dispatchEvent(new Event('input',{bubbles:true}));");assert.deepEqual(await cdp.eval(panel,"[$('player_name').value,$('player_pos').value]"),['张三','GK']);
      await cdp.eval(panel,"$('player_num').value='99';$('player_num').dispatchEvent(new Event('input',{bubbles:true}));");assert.equal(await cdp.eval(panel,"$('player_pos').value"),'');
      const viewer=await cdp.page(server.base+'/titles/graphics.html');await cdp.until(viewer,"$('lineupAll').querySelectorAll('.lu-gk').length===3");
      assert(await cdp.eval(viewer,"$('lineupAll').querySelector('[data-player=\"home|1|张三\"] .lu-cap.show')!==null"));assert(!await cdp.eval(viewer,"$('goal').classList.contains('on')"));
      await post({lineup_mode:'single',lineup_active:'xiH'});await cdp.until(viewer,"$('lineupList').querySelector('.lu-gk')!==null");await post({lineup_mode:'all'});
      const beforeExport=fs.readFileSync(file,'utf8');await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
      await cdp.eval(panel,"$('teamHome').value='导出主队';$('teamHome').dispatchEvent(new Event('input',{bubbles:true}));");
      await cdp.send('Page.bringToFront',{},panel);const rect=await cdp.eval(panel,"(()=>{var r=$('matchConfigExport').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',buttons:1,clickCount:1},panel);await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',buttons:0,clickCount:1},panel);
      await cdp.until(panel,"$('matchConfigStatus').textContent.startsWith('已导出')&&!$('matchConfigExport').disabled");
      const exportedName='比赛配置-导出主队-vs-客队甲.txt',exportedFile=path.join(downloads,exportedName);for(let i=0;i<50&&!fs.existsSync(exportedFile);i++)await delay(100);assert(fs.existsSync(exportedFile),'A real TXT was downloaded');
      const exportedText=fs.readFileSync(exportedFile,'utf8'),exported=config.parse(exportedText);assert.equal(exported.teams.home.name,'导出主队');assert.equal(exported.teams.home.logo.data,pixel);assert.equal(fs.readFileSync(file,'utf8'),beforeExport,'Exporting includes drafts without saving them');
      async function upload(name,contents,ok=true){await cdp.eval(panel,`(()=>{var input=$('matchConfigFile'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(contents)}],${JSON.stringify(name)},{type:'text/plain'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await cdp.until(panel,`!$('matchConfigExport').disabled && $('matchConfigStatus').textContent.startsWith(${JSON.stringify(ok?'已载入':'载入失败')})`);}
      const next=config.example();next.teams.home.name='下一场主队';next.teams.away.name='Next Away';next.teams.away.logo={data:pixel,filename:'新客队.svg.png'};
      await upload('下一场.txt',config.stringify(next));let state=await read();assert.equal(state.teamHome,next.teams.home.name);assert.equal(state.awayLogo_filename,'新客队.svg.png');assert.equal(state.homeLogo,'');assert.equal(await cdp.eval(panel,"$('homeLogoFileInfo').textContent"),'未上传');
      assert.equal(state.scoreHome,initial.scoreHome);assert.equal(state.scoreAway,initial.scoreAway);assert.deepEqual(state.sb_clock_state,initial.sb_clock_state);assert.deepEqual(state.sb_pos,initial.sb_pos);assert.equal(state.theme_font,initial.theme_font);assert.equal(state.goal_tick,initial.goal_tick);assert.equal(state.goal_team,'Next Away');assert.equal(state.goal_name,'');
      assert.equal(await cdp.eval(panel,"$('xiH_team').value"),'下一场主队');assert(await cdp.eval(panel,"Array.from($('goal_roster_player').options).some(o=>o.textContent.includes('GK'))"));
      await cdp.until(viewer,"S.teamHome==='下一场主队'");assert(!await cdp.eval(viewer,"$('goal').classList.contains('on')"),'Config import never triggers a historical event');
      const saved=fs.readFileSync(file,'utf8');await cdp.eval(panel,"$('goal_name').value='保留未保存草稿'");await upload('坏文件.txt','not JSON',false);assert.equal(fs.readFileSync(file,'utf8'),saved);assert.equal(await cdp.eval(panel,"$('goal_name').value"),'保留未保存草稿');
      await cdp.eval(panel,"window.originalFetch=fetch;window.fetch=function(url,opt){if(String(url).endsWith('/state.json')&&opt&&opt.method==='POST')return Promise.resolve(new Response(JSON.stringify({ok:false,error:'test save failure'}),{status:500,headers:{'Content-Type':'application/json'}}));return originalFetch(url,opt);};");await upload(exportedName,exportedText,false);assert.equal(fs.readFileSync(file,'utf8'),saved);assert.equal(await cdp.eval(panel,"$('teamHome').value"),'下一场主队');await cdp.eval(panel,'window.fetch=originalFetch');
      await upload(exportedName,exportedText);assert.equal(await cdp.eval(panel,"$('homeLogoFileInfo').textContent"),'主队.png');assert.equal((await read()).teamHome,'导出主队');
      await cdp.eval(panel,"$('sub_off_num').value='10';$('sub_off_num').dispatchEvent(new Event('input',{bubbles:true}));$('sub_on_num').value='12';$('sub_on_num').dispatchEvent(new Event('input',{bubbles:true}));executeSubstitution()");await cdp.until(panel,"Array.from($('sub_off_player').options).some(o=>o.value==='home|12|球员乙')");
      await upload(exportedName,exportedText);assert.deepEqual((await read()).onfield_home,['home|1|张三','home|10|李四'],'Reloading identical roster text still restores starters');
      await cdp.send('Page.reload',{},panel);await cdp.until(panel,"$('homeLogoFileInfo').textContent==='主队.png'&&!$('matchConfigExport').disabled");assert(await cdp.eval(panel,"$('xiH_players').value.includes('(GK) (C)')"));
      if(kind==='node'){
        await cdp.send('Page.bringToFront',{},panel);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);await cdp.eval(panel,"selectPanelTab('lineups',true);window.scrollTo(0,0)");await delay(300);
        assert(await cdp.eval(panel,"document.documentElement.scrollWidth<=innerWidth"));const out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(out,{recursive:true});let shot=await cdp.send('Page.captureScreenshot',{format:'png'},panel);fs.writeFileSync(path.join(out,'control-match-config.png'),Buffer.from(shot.data,'base64'));
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:620,height:900,deviceScaleFactor:1,mobile:false},panel);assert(await cdp.eval(panel,"document.documentElement.scrollWidth<=innerWidth"));
        await cdp.send('Page.bringToFront',{},viewer);await cdp.until(viewer,"S.teamHome==='导出主队'&&$('lineupAll').querySelectorAll('.lu-gk').length===3");await delay(900);const clip=await cdp.eval(viewer,"(()=>{var r=$('lineup').getBoundingClientRect();return {x:Math.max(0,r.x-10),y:Math.max(0,r.y-10),width:r.width+20,height:r.height+20,scale:1};})()");shot=await cdp.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true},viewer);fs.writeFileSync(path.join(out,'broadcast-roster-gk.png'),Buffer.from(shot.data,'base64'));
      }
      const targets=await cdp.send('Target.getTargets');for(const t of targets.targetInfos.filter(t=>t.type==='page'&&t.url.startsWith(server.base+'/')))await cdp.send('Target.closeTarget',{targetId:t.targetId});await stop(server.child);server=null;
      console.log('PASS '+kind+' actual TXT download, two-match switching, logos/metadata, GK in both lineup modes, shared identities/number lookup, failed-file/save preservation, onfield reset, no event replay, refresh and responsive layout');
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);assert.equal(hash(),originalHash,'Real working data remains untouched');
  }finally{
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}if(server)await stop(server.child);await delay(400);
    if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('fbp-match-configs-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
