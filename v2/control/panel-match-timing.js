(function(){
  'use strict';
  var dirty=false,last='',deadline=0;
  function el(id){return document.getElementById(id);}
  function inputs(){return {enabled:el('matchAutoEnabled').checked,halfMinutes:Number(el('matchHalfMinutes').value),breakMinutes:Number(el('matchBreakMinutes').value),autoResume:el('matchAutoResume').checked};}
  function observe(controls){
    if(!controls)return;
    if(controls.period){el('livePeriod').textContent=controls.period;if(document.activeElement!==el('period')){el('period').value=controls.period;if(window.FBPWidgets)FBPWidgets.sync();}}
    if(controls.match_clock){var c=controls.match_clock,age=c.running?Math.max(0,Date.now()-c.base):0;LIVE_CLOCK={clock:{running:c.running,mode:c.mode,milliseconds:Math.max(0,c.accMs+(c.mode==='down'?-age:age))},received:Date.now()};renderLiveClock();}
    deadline=Number(controls.match_break_until)||0;
    var cfg=controls.match_timing;if(!cfg||dirty)return;var signature=JSON.stringify(cfg);if(signature===last)return;last=signature;
    el('matchAutoEnabled').checked=cfg.enabled;el('matchHalfMinutes').value=cfg.halfMinutes;el('matchBreakMinutes').value=cfg.breakMinutes;el('matchAutoResume').checked=cfg.autoResume;
    el('matchTimingNote').textContent='';
  }
  function support(){return fetch(serverBase+'/api/d200/status',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('无法读取计时服务');return r.json();});}
  function clock(cmd){return sendState(function(){return support().then(function(s){var c=s.controls||{},requested=cmd==='toggle'?(c.sb_clockrun?'pause':'start'):cmd,actual=requested==='start'&&(c.period==='中场休息'||c.status==='half')?'second':requested;if(actual==='second'&&c.timing_version!==1)throw Error('请重启控制服务或使用新版便携程序，再开始下半场');return {sb_clockcmd:actual,sb_clock_tick:nTick(),status:actual==='pause'?'paused':'running'};});});}
  function save(){
    var cfg=inputs(),signature=JSON.stringify(cfg);
    if(!Number.isInteger(cfg.halfMinutes)||cfg.halfMinutes<1||cfg.halfMinutes>180||!Number.isInteger(cfg.breakMinutes)||cfg.breakMinutes<0||cfg.breakMinutes>120){el('matchTimingNote').textContent='每半场请输入 1–180 分钟，中场休息请输入 0–120 分钟（整数）。';return Promise.resolve(null);}
    return sendState(function(){return support().then(function(s){if(!s.controls||s.controls.timing_version!==1)throw Error('当前控制服务是旧版本，请重启服务或使用新版便携程序后保存自动切换设置');return {match_timing:cfg};});}).then(function(res){if(res&&JSON.stringify(inputs())===signature){dirty=false;last='';observe(res.controls);}else if(!res)el('matchTimingNote').textContent='设置未保存';return res;});
  }
  function toggle(){FBPDesk.toggleFlyout('topClockSettings',el('topClockSettingsButton'));}
  function init(){
    ['matchAutoEnabled','matchHalfMinutes','matchBreakMinutes','matchAutoResume'].forEach(function(id){el(id).addEventListener('input',function(){dirty=true;el('matchTimingNote').textContent='未保存';});});
    var header=document.querySelector('.app-header');function height(){document.documentElement.style.setProperty('--console-header-height',header.getBoundingClientRect().height+'px');}height();if(window.ResizeObserver)new ResizeObserver(height).observe(header);
  }
  window.FBPMatchTiming={init:init,observe:observe,save:save,clock:clock,toggle:toggle,breakUntil:function(){return deadline;}};
})();
