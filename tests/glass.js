// Exercise real native pickers and interruptible motion with isolated match data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {CDP}=require('./browser'),{startServer,stop,delay}=require('./regression');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-glass-')),profile=path.join(temp,'edge'),file=path.join(temp,'state.json');
  const out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(out,{recursive:true});
  const xi=['10 球员一','23 球员乙','4 球员三','6 球员四','3 球员五','20 球员六','7 球员七','15 球员八','9 球员九','18 球员十','22 球员十一'];
  const bench=['13 球员戊','24 球员40','1 球员34','2 球员35','5 球员37','8 球员14','11 球员十三','12 球员38','14 球员36','16 球员33','17 加纳乔'];
  fs.writeFileSync(file,JSON.stringify({teamHome:'主队',teamAway:'客队',xiH_players:xi.join('\n'),subH_players:bench.join('\n'),scoreHome:2,scoreAway:1}));
  let server,browser,cdp;
  try{
    server=await startServer('node',file);
    browser=spawn(process.env.FBP_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
      '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);
    assert(fs.existsSync(active),'Edge did not start');
    const [port,endpoint]=fs.readFileSync(active,'utf8').trim().split(/\r?\n/),ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
    await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
    cdp=new CDP(ws);const panel=await cdp.page(server.base+'/control/panel.html');await cdp.send('Page.bringToFront',{},panel);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);
    await cdp.until(panel,"$('goal_roster_player').options.length===23 && !!document.querySelector('.tab-indicator path')");
    const snapshot=fs.readFileSync(file,'utf8');
    async function shot(name){const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},panel);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
    await shot('control-transparent-nav');
    const initial=await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath");
    await cdp.eval(panel,"selectPanelTab('events');window.scrollTo(0,0)");await delay(90);await shot('control-liquid-motion');
    const moving=await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath");assert.notEqual(moving,initial,'Lens moves through intermediate contours');
    const interruption=await cdp.eval(panel,"(()=>{var el=document.querySelector('.tab-indicator'),before=el.style.clipPath;selectPanelTab('devices');selectPanelTab('match');return before===el.style.clipPath;})()");
    assert(interruption,'Rapid reversal starts from the current visible contour');await delay(1200);
    assert.equal(await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath"),initial,'Lens returns to its unstretched shape');
    await cdp.eval(panel,"$('tab-match').focus()");
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},panel);
    const keyboard=await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath");await delay(300);
    assert.equal(await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath"),keyboard,'Keyboard tab changes are immediate');
    assert.equal(await cdp.eval(panel,'document.activeElement.id'),'tab-events');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},panel);
    await cdp.eval(panel,"selectPanelTab('devices')");const reduced=await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath");await delay(300);
    assert.equal(await cdp.eval(panel,"document.querySelector('.tab-indicator').style.clipPath"),reduced);
    await cdp.send('Emulation.setEmulatedMedia',{features:[]},panel);
    await cdp.eval(panel,"selectPanelTab('events',true);window.scrollTo(0,0)");
    assert(await cdp.eval(panel,"CSS.supports('appearance','base-select')"),'Browser supports the customizable native picker');
    assert.equal(await cdp.eval(panel,"getComputedStyle($('goal_roster_player')).display"),'inline-flex');
    const rect=await cdp.eval(panel,"(()=>{var r=$('goal_roster_player').getBoundingClientRect();return {x:r.x+40,y:r.y+r.height/2};})()");
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    await cdp.until(panel,"$('goal_roster_player').matches(':open')");
    const material=await cdp.eval(panel,"(()=>{var s=getComputedStyle($('goal_roster_player'),'::picker(select)');return {radius:s.borderRadius,background:s.backgroundColor,filter:s.backdropFilter,scrollbar:s.scrollbarWidth};})()");
    assert.equal(material.radius,'22px');assert(material.filter.includes('blur'));assert.equal(material.scrollbar,'none');assert(material.background.endsWith('0.22)'));
    await shot('control-glass-roster');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40},panel);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},panel);
    await cdp.until(panel,"!$('goal_roster_player').matches(':open')");
    assert.deepEqual(await cdp.eval(panel,"[$('goal_num').value,$('goal_name').value]"),['10','球员一'],'Real keyboard selection triggers number/name linkage');
    // A real wheel still scrolls the menu after hiding its scrollbar.
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    await cdp.until(panel,"$('goal_roster_player').matches(':open')");
    const before=await cdp.eval(panel,"$('goal_roster_player').options[1].getBoundingClientRect().top");
    const wheel=await cdp.eval(panel,"(()=>{var r=$('goal_roster_player').options[1].getBoundingClientRect();return {x:r.x+40,y:r.y+20};})()");
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:wheel.x,y:wheel.y,deltaX:0,deltaY:550},panel);await delay(300);
    assert(await cdp.eval(panel,"$('goal_roster_player').options[1].getBoundingClientRect().top")<before,'Hidden scrollbar does not disable wheel scrolling');
    await shot('control-glass-roster-scrolled');
    const benchPoint=await cdp.eval(panel,"(()=>{var o=Array.from($('goal_roster_player').options).find(o=>o.value==='home|5|球员37'),r=o.getBoundingClientRect();return {x:r.x+45,y:r.y+20};})()");
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:benchPoint.x,y:benchPoint.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    await cdp.until(panel,"!$('goal_roster_player').matches(':open')");
    assert.deepEqual(await cdp.eval(panel,"[$('goal_num').value,$('goal_name').value]"),['5','球员37'],'Real mouse selection of an outside player retains linkage');
    // Escape dismisses a picker without committing a different player.
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    await cdp.until(panel,"$('goal_roster_player').matches(':open')");
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},panel);
    await cdp.until(panel,"!$('goal_roster_player').matches(':open')");
    assert.equal(await cdp.eval(panel,"$('goal_num').value"),'5');
    // Opening near the edge on a narrow screen stays inside the viewport.
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},panel);
    await cdp.eval(panel,"$('goal_roster_player').scrollIntoView({block:'center'})");await delay(100);
    const mobile=await cdp.eval(panel,"(()=>{var r=$('goal_roster_player').getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2};})()");
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:mobile.x,y:mobile.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},panel);
    await cdp.until(panel,"$('goal_roster_player').matches(':open')");
    assert(await cdp.eval(panel,"Array.from($('goal_roster_player').options).every(o=>{var r=o.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})"),'Native anchoring keeps narrow-screen options inside the viewport');
    assert(await cdp.eval(panel,"(()=>{var s=$('goal_roster_player'),r=s.getBoundingClientRect(),available=Math.max(r.top-12,innerHeight-r.bottom-12);return parseFloat(s.style.getPropertyValue('--picker-space'))<=available+.5;})()"),'Menu height is capped to the available vertical space');
    await shot('control-glass-mobile');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},panel);
    await cdp.until(panel,"!$('goal_roster_player').matches(':open')");
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]},panel);
    assert.equal(await cdp.eval(panel,"getComputedStyle($('goal_roster_player'),'::picker(select)').backdropFilter"),'none');
    assert.equal(await cdp.eval(panel,"getComputedStyle($('goal_roster_player'),'::picker(select)').backgroundColor"),'rgb(247, 248, 250)');
    await cdp.send('Emulation.setEmulatedMedia',{features:[]},panel);
    // Exercise the glass switch and native slider with real keyboard/pointer input.
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},panel);
    await cdp.eval(panel,"$('goal_sync').scrollIntoView({block:'center'});$('goal_sync').focus()");
    const switchBefore=await cdp.eval(panel,"$('goal_sync').checked");
    async function key(key,code,n){for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n},panel);}
    async function switchMaterial(){return cdp.eval(panel,"(()=>{var e=$('goal_sync'),s=getComputedStyle(e),t=getComputedStyle(e,'::before');return {checked:e.checked,fill:s.backgroundColor,thumb:t.backgroundColor,blur:t.backdropFilter,transform:t.transform};})()");}
    await key(' ','Space',32);await delay(180);const changed=await switchMaterial();
    assert.equal(changed.checked,!switchBefore);assert(changed.thumb.startsWith('rgba(')&&changed.blur.includes('blur'),'Switch lens stays translucent in both states');
    await shot('control-glass-switch');await key(' ','Space',32);await delay(180);const restored=await switchMaterial();
    assert.equal(restored.checked,switchBefore);assert.notEqual(changed.fill,restored.fill,'On/off use different white/transparent surfaces');assert.notEqual(changed.transform,restored.transform,'Thumb moves to the other end');
    await cdp.eval(panel,"selectPanelTab('appearance',true);$('animdur').scrollIntoView({block:'center'});$('animdur').focus()");
    await key('End','End',35);assert.equal(await cdp.eval(panel,"$('animdur').value"),'2');
    await key('Home','Home',36);assert.equal(await cdp.eval(panel,"$('animdur').value"),'0.5');
    await key('ArrowRight','ArrowRight',39);assert.equal(await cdp.eval(panel,"$('animdur').value"),'0.55');assert.equal(await cdp.eval(panel,"$('animdurVal').textContent"),'0.55×');
    const rail=await cdp.eval(panel,"(()=>{var r=$('animdur').getBoundingClientRect();return {x:r.x+19+(r.width-38)/30,y:r.y+r.height/2,to:r.x+19+(r.width-38)*.75};})()");
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rail.x,y:rail.y,button:'left',buttons:1,clickCount:1},panel);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rail.to,y:rail.y,button:'left',buttons:1},panel);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rail.to,y:rail.y,button:'left',buttons:0,clickCount:1},panel);
    const drag=await cdp.eval(panel,"({value:Number($('animdur').value),label:$('animdurVal').textContent,fill:$('animdur').style.getPropertyValue('--range-fill')})");
    assert(Math.abs(drag.value-1.625)<=.026,'Transparent thumb still follows native pointer drag: '+JSON.stringify({drag,rail}));assert.equal(drag.label,drag.value.toFixed(2)+'×');assert(drag.fill.startsWith('calc('),'Blue fill follows the native value');
    await shot('control-glass-slider');
    // A one-shot action highlights on press, but does not latch or save on a cancelled press.
    await cdp.eval(panel,"document.querySelector('[onclick=\"applyCustom()\"]').scrollIntoView({block:'center'})");
    const action=await cdp.eval(panel,"(()=>{var b=document.querySelector('[onclick=\"applyCustom()\"]'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,rest:getComputedStyle(b).backgroundColor};})()");
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:'left',buttons:1,clickCount:1},panel);
    assert.notEqual(await cdp.eval(panel,"getComputedStyle(document.querySelector('[onclick=\"applyCustom()\"]')).backgroundColor"),action.rest,'Press feedback is immediate');
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2,buttons:1},panel);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',buttons:0,clickCount:1},panel);await delay(180);
    assert.equal(await cdp.eval(panel,"getComputedStyle(document.querySelector('[onclick=\"applyCustom()\"]')).backgroundColor"),action.rest);
    // Both auxiliary pages use the same material and readable selected captions.
    const d200=await cdp.page(server.base+'/control/d200.html');await cdp.until(d200,"document.querySelectorAll('#actions button').length===12");
    await cdp.send('Page.bringToFront',{},d200);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},d200);
    assert.equal(await cdp.eval(d200,"getComputedStyle(document.querySelector('#actions button.selected .group')).color"),'rgb(0, 104, 197)');
    await cdp.eval(d200,"document.querySelectorAll('#actions button')[1].click()");
    assert.equal(await cdp.eval(d200,"document.querySelectorAll('#actions button.selected').length"),1);
    await delay(200);
    const dshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},d200);fs.writeFileSync(path.join(out,'control-d200-glass.png'),Buffer.from(dshot.data,'base64'));
    const preview=await cdp.page(server.base+'/control/preview.html');await cdp.until(preview,"!!document.querySelector('nav button.on')");
    await cdp.send('Page.bringToFront',{},preview);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},preview);
    for(const id of [d200,preview])assert(await cdp.eval(id,"Array.from(document.querySelectorAll('button')).every(b=>{var s=getComputedStyle(b);return s.backdropFilter.includes('blur')&&parseFloat(s.borderRadius)>20;})"),'Every auxiliary button has the shared glass material');
    await cdp.until(preview,"(()=>{var f=document.querySelector('iframe'),d=f&&f.contentDocument;return d&&d.querySelector('#editbar button')&&d.defaultView.getComputedStyle(d.querySelector('#editbar button')).backdropFilter.includes('blur');})()");
    const pshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},preview);fs.writeFileSync(path.join(out,'control-preview-glass.png'),Buffer.from(pshot.data,'base64'));
    assert.equal(fs.readFileSync(file,'utf8'),snapshot,'Glass interactions and player selection remain read-only drafts');
    for(const kind of ['node','powershell']){
      let other;try{other=kind==='node'?server:await startServer(kind,file);
        for(const name of ['glass-theme.css','liquid-nav.js','vendor/motion.js'])assert.equal((await fetch(other.base+'/control/'+name)).status,200);
      }finally{if(kind==='powershell'&&other)await stop(other.child);}
    }
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
    assert.equal(cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)&&!e.params.request.url.startsWith(server.base+'/')).length,0);
    console.log('PASS connected liquid contour, native picker and roster linkage, narrow-screen scroll, glass on/off switch, slider keyboard/pointer control, cancelled button press, D200/preview materials and standalone assets');
  }finally{
    if(cdp){try{await cdp.send('Browser.close');}catch(_){}cdp.ws.close();}
    if(browser&&browser.exitCode===null){await delay(300);if(browser.exitCode===null)await stop(browser);}
    if(server)await stop(server.child);
    if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup path');
    await delay(500);fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
