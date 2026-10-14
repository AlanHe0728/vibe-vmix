// Actual on-air rendering checks; all match data lives in a temporary folder.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-broadcast-')),profile=path.join(temp,'edge');
  const stateFile=path.join(temp,'state.json'),out=path.resolve(__dirname,'../docs/screenshots');
  fs.mkdirSync(out,{recursive:true});
  const roster='1 球员甲\n2 球员丁\n3 球员戊\n4 球员己\n5 球员庚\n6 球员辛\n7 球员壬\n8 球员癸\n9 球员12\n10 球员乙 (C)\n11 球员13';
  fs.writeFileSync(stateFile,JSON.stringify({teamHome:'主队',teamAway:'客队',scoreHome:2,scoreAway:1,scoreboard_show:true,period:'下半场',sb_clockacc:3825000,
    clock_show:true,clock_label:'中场休息',clock_sub:'HALF TIME',clock_mm:15,clock_mode:'down',
    lineup_show:true,lineup_mode:'single',lineup_active:'xiH',xiH_team:'主队',xiH_players:roster,
    xiA_team:'客队',xiA_players:roster,subH_team:'主队',subH_players:roster.split('\n').slice(0,7).join('\n'),subA_team:'客队',subA_players:roster.split('\n').slice(0,7).join('\n'),
    subH_subtitle:'替补球员',subA_subtitle:'替补球员',xiH_subtitle:'首发阵容',xiA_subtitle:'首发阵容',
    goal_name:'球员乙',goal_num:'10',goal_team:'主队',goal_scoreHome:2,goal_scoreAway:1,
    card_num:'17',card_name:'球员12',card_team:'客队',card_reason:'犯规',
    player_num:'10',player_name:'球员乙',player_team:'主队',player_pos:'中场',player_event:'队长',
    restart_team:'主队',restart_player:'10 球员乙',hold_goal:30,hold_card:30,hold_rst:30,hold_ply:30}));
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
    cdp=new CDP(ws);const page=await cdp.page(server.base+'/titles/graphics.html');
    await cdp.until(page,"S.teamHome==='主队' && $('lineupList').children.length===11");
    const snapshot=fs.readFileSync(stateFile,'utf8');
    assert.equal(await cdp.eval(page,'getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)','Broadcast background stays transparent');
    assert.equal(await cdp.eval(page,"getComputedStyle(document.querySelector('.sb-bar')).backgroundColor"),'rgb(247, 249, 249)','Scoreboard has a neutral data surface');
    const lanes=await cdp.eval(page,"(()=>{var h=document.querySelector('.sb-side.home').getBoundingClientRect(),a=document.querySelector('.sb-side.away').getBoundingClientRect(),m=$('sbMid').getBoundingClientRect(),c=$('sbClock').getBoundingClientRect();return {home:h.width,away:a.width,scoreX:m.x+m.width/2,clockX:c.x+c.width/2,clockTop:c.top,laneBottom:h.bottom};})()");
    assert(Math.abs(lanes.home-lanes.away)<1,'Team lanes are symmetric');
    assert(Math.abs(lanes.scoreX-lanes.clockX)<1&&Math.abs(lanes.clockTop-lanes.laneBottom)<1,'Clock hangs directly below the score');
    assert.equal(await cdp.eval(page,"getComputedStyle(document.querySelector('.lu-panel')).backgroundColor"),'rgb(247, 249, 249)','Roster uses the same neutral paper');
    function luminance(rgb){return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
    for(const selector of ['.sb-side .nm','.gd-who .n','.gd-who .t','.lu-name']){
      const color=await cdp.eval(page,"getComputedStyle(document.querySelector('"+selector+"')).color");
      const rgb=color.match(/[0-9.]+/g).slice(0,3).map(Number);
      assert((luminance([247,249,249])+.05)/(luminance(rgb)+.05)>=4.5,selector+' readable on neutral paper');
    }
    const items=[];
    async function crop(id,title){
      await cdp.eval(page,`document.querySelectorAll('#canvas>.pos').forEach(el=>el.style.visibility=el.id==='${id}'?'visible':'hidden')`);
      await delay(650);
      const bounds=await cdp.eval(page,`(()=>{const r=$('${id}').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20,scale:1};})()`);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',clip:bounds,captureBeyondViewport:true},page);
      fs.writeFileSync(path.join(out,'broadcast-'+id+'-'+items.length+'.png'),Buffer.from(shot.data,'base64'));
      items.push({title,image:'data:image/png;base64,'+shot.data});
      await cdp.eval(page,"document.querySelectorAll('#canvas>.pos').forEach(el=>el.style.visibility='')");
    }
    // Neutral compositing background exists only in this temporary browser.
    await cdp.eval(page,"document.body.style.background='#283b32'");
    await crop('sb','比分条 · 两队等宽 / 比分 / 比赛时间');await crop('clk','独立计时 · 正计时与倒计时');
    await cdp.eval(page,"goalShow()");await crop('goal','进球 · 球员 / 球队 / 最新比分');
    await cdp.eval(page,"cdShow('yellow')");await crop('card','判罚 · 黄牌');
    await cdp.eval(page,"cdShow('red')");await crop('card','判罚 · 红牌');
    await cdp.eval(page,'plyShow()');await crop('ply','球员信息 · 号码 / 姓名 / 位置');
    for(const type of ['kickoff','throwin','corner','goalkick','freekick','penalty']){
      await cdp.eval(page,`rstShow('${type}')`);
      await cdp.until(page,"$('rstBadge').querySelector('img').complete && $('rstBadge').querySelector('img').naturalWidth>0");
      await crop('rst','发球 · '+({kickoff:'开球',throwin:'界外球',corner:'角球',goalkick:'球门球',freekick:'任意球',penalty:'点球'})[type]);
    }
    for(const key of ['xiH','xiA','subH','subA']){
      await cdp.eval(page,`S.lineup_active='${key}';luApply();`);
      assert.equal(await cdp.eval(page,"$('lineupTeam').textContent"),key.endsWith('H')?'主队':'客队');
      assert.equal(await cdp.eval(page,"$('lineupRailTitle').textContent"),key.startsWith('sub')?'替补球员':'首发阵容','Horizontal subtitle tracks the active roster');
      const captured=await cdp.eval(page,"window.savedRow=$('lineupList').firstChild;luApply();savedRow===$('lineupList').firstChild");
      assert(captured,'Repeated polling must preserve lineup DOM');
    }
    await cdp.eval(page,"S.lineup_active='xiH';luApply()");await crop('lineup','首发名单 · 四份内容共用一个面板');
    await cdp.eval(page,`document.body.style.background='transparent';const pitch=document.createElement('div');pitch.id='testPitch';pitch.innerHTML='<div class="pitch-bounds"></div><div class="pitch-mid"></div><div class="pitch-circle"></div><div class="pitch-box left"></div><div class="pitch-box right"></div>';document.body.prepend(pitch);const st=document.createElement('style');st.textContent='#testPitch{position:absolute;inset:0;background:repeating-linear-gradient(90deg,#426347 0 160px,#4d7050 160px 320px)}#testPitch>div{position:absolute;border:2px solid #e7f3e354}.pitch-bounds{inset:100px 180px}.pitch-mid{left:50%;top:100px;bottom:100px;width:0}.pitch-circle{left:50%;top:50%;width:230px;height:230px;border-radius:50%;transform:translate(-50%,-50%)}.pitch-box{top:calc(50% - 220px);height:440px;width:210px}.pitch-box.left{left:180px}.pitch-box.right{right:180px}';document.head.append(st);Object.keys(AUTO).forEach(id=>clearTimeout(AUTO[id]));document.querySelectorAll('#canvas>.pos').forEach(el=>el.classList.remove('on'));S.sb_pos={x:440,y:142};S.lineup_pos={x:1480,y:540};S.goal_pos={x:480,y:900};['sb','lineup','goal'].forEach(id=>applyPos(id,id));sbApply();luApply();goalShow();fitBroadcastText();`);
    await delay(650);
    const safe=await cdp.eval(page,"['sb','lineup','goal'].map(id=>{var r=$(id).getBoundingClientRect();return r.left>=96&&r.right<=1824&&r.top>=54&&r.bottom<=1026;})");
    assert(safe.every(Boolean),'Full-frame preview stays within 5 percent title safety');
    const frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},page);
    fs.writeFileSync(path.join(out,'broadcast-scene.png'),Buffer.from(frame.data,'base64'));
    await cdp.eval(page,"$('testPitch').remove();document.body.style.background='#283b32'");
    // Larger real rosters flow into two columns and keep every row visible.
    await cdp.eval(page,"S.xiH_players=Array.from({length:26},(_,i)=>(i+1)+' 球员姓名').join(String.fromCharCode(10));luApply()");
    const geometry=await cdp.eval(page,"(()=>{var panel=$('lineup').getBoundingClientRect();return Array.from($('lineupList').children).map(row=>{var r=row.getBoundingClientRect();return r.top>=panel.top&&r.bottom<=panel.bottom&&r.left>=panel.left&&r.right<=panel.right;});})()");
    assert.equal(geometry.length,26);assert(geometry.every(Boolean),'All roster rows must fit within the plate');
    await cdp.eval(page,"S.xiH_players='1 球员甲'+String.fromCharCode(10)+'2 球员己';S.xiH_subtitle='客队全体球员候补轮换名单测试';luApply()");
    assert(await cdp.eval(page,"$('lineup').getBoundingClientRect().height<380"),'Long subtitle must not stretch a short roster off-screen');
    await cdp.eval(page,"S.theme_skin='glass';S.theme_accent='#FFFFFF';applyTheme()");
    assert.equal(await cdp.eval(page,"getComputedStyle(document.querySelector('.sb-mid')).backgroundImage"),'none','Existing white accent must not recolor the score cell');
    await cdp.eval(page,"S.goal_name='ALEJANDRO GARNACHO';S.player_name='亚历山德罗·德尔皮耶罗';S.card_name='ALEXANDER-ARNOLD';goalShow();plyShow();cdShow('red')");
    assert(await cdp.eval(page,"['gdName','plyName','cdName'].every(id=>$(id).scrollWidth<=$(id).clientWidth+1)"),'Long names should fit before truncating');
    await cdp.eval(page,"S.goal_pos={x:960,y:500};S.card_pos={x:960,y:500};applyPos('goal','goal');applyPos('card','card');goalShow();cdShow('yellow')");
    assert.deepEqual(await cdp.eval(page,"[$('goal').classList.contains('on'),$('card').classList.contains('on'),$('sb').classList.contains('on'),$('lineup').classList.contains('on')]"),[false,true,true,true]);
    await cdp.eval(page,"S.hold_card=.1;cdShow('red')");await delay(900);
    assert.equal(await cdp.eval(page,"$('card').classList.contains('on')"),false,'Auto exit remains operational');
    assert.equal(await cdp.eval(page,"document.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity).length"),0,'No decorative looping animations');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},page);
    assert.equal(await cdp.eval(page,"getComputedStyle($('sb')).transitionDuration"),'0s');
    for(const [file,id] of Object.entries({scoreboard:'sb',clock:'clk',restart:'rst',card:'card',player:'ply',goal:'goal',lineup:'lineup'})){
      const legacy=await cdp.page(server.base+'/titles/'+file+'.html?state='+encodeURIComponent(server.base+'/state.json'));
      await cdp.until(legacy,`typeof S!=='undefined' && S.teamHome==='主队'`);
      assert.equal(await cdp.eval(legacy,"new URLSearchParams(location.search).get('only')"),id);
      assert.equal(await cdp.eval(legacy,"STATE_URL"),server.base+'/state.json');
      assert.deepEqual(await cdp.eval(legacy,"Array.from(document.querySelectorAll('#canvas>.pos')).filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)"),[id]);
    }
    assert.equal(fs.readFileSync(stateFile,'utf8'),snapshot,'Visual checks must not change even fixture state');
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,'No renderer errors');
    // Contact sheet contains screenshots of the actual renderer, not mockups.
    const sheet=await cdp.page('about:blank');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1680,height:1920,deviceScaleFactor:1,mobile:false},sheet);
    await cdp.eval(sheet,`document.write('<style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#eef2f2;color:#20282b;font-family:Segoe UI,Microsoft YaHei,sans-serif}h1{margin:0 0 6px;font-size:30px}p{margin:0 0 28px;color:#526267;font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.tile{background:white;padding:20px}.tile:last-child{grid-column:1/-1}.tile img{display:block;max-width:100%;height:auto}.tile:last-child img{max-height:480px}.title{margin:0 0 14px;font-size:15px;font-weight:600}</style><h1>足球转播包装</h1><p>实际浏览器渲染 · 浅色比分横条 / 下挂时钟 / 对齐的信息行</p><div class="grid"></div>');const items=${JSON.stringify(items)};items.forEach(item=>{const tile=document.createElement('div');tile.className='tile';const title=document.createElement('div');title.className='title';title.textContent=item.title;const img=document.createElement('img');img.src=item.image;tile.append(title,img);document.querySelector('.grid').append(tile)});Promise.all(Array.from(document.images).map(img=>img.decode())).then(()=>true)`);
    const contact=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1680,height:await cdp.eval(sheet,'document.documentElement.scrollHeight'),scale:1}},sheet);
    fs.writeFileSync(path.join(out,'broadcast-overview.png'),Buffer.from(contact.data,'base64'));
    console.log('PASS broadcast transparency, scoreclock proportions and contrast, all 6 restart icons, 4 stable rosters, 26-player geometry, long names, overlap, auto exit, reduced motion and 7 shared legacy entries');
    console.log('Preview: '+path.join(out,'broadcast-overview.png'));
  }finally{
    if(cdp)await cdp.send('Browser.close').catch(()=>{});
    if(browser&&!browser.killed)browser.kill();if(server)await stop(server.child);await delay(650);
    const resolved=path.resolve(temp);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('fbp-broadcast-'))fs.rmSync(resolved,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
