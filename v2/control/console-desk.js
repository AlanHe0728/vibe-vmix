/* Console-only presentation. Commands still use the shared, acknowledged state. */
(function(){
  'use strict';
  var tasks=['goal','card','sub','player','restart','timer'],controls={},ready=false;
  var flyout=null,opener=null,clockBusy=false,visibilityBusy=false,lineupBusy=false;
  function el(id){return document.getElementById(id);}
  function reveal(node){
    if(matchMedia('(prefers-reduced-motion:reduce)').matches||!node.animate)return;
    if(node._reveal)node._reveal.cancel();
    node._reveal=node.animate([{opacity:.82},{opacity:1}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  function closeFlyout(focus){
    if(!flyout)return;
    el(flyout).hidden=true;
    if(opener)opener.setAttribute('aria-expanded','false');
    var previous=opener;flyout=null;opener=null;
    if(focus&&previous)previous.focus();
  }
  function toggleFlyout(id,button){
    var closing=flyout===id;closeFlyout(false);if(closing)return;
    flyout=id;opener=button;el(id).hidden=false;button.setAttribute('aria-expanded','true');reveal(el(id));
    var target=el(id).querySelector('input:not([type=checkbox]),select,button');if(target)target.focus({preventScroll:true});
  }
  function task(key,focus){
    if(tasks.indexOf(key)<0)return;
    tasks.forEach(function(name){var active=name===key;el('event-'+name).hidden=!active;el('task-'+name).setAttribute('aria-selected',String(active));el('task-'+name).tabIndex=active?0:-1;});
    if(focus)el('task-'+key).focus();
    reveal(el('event-'+key));
  }
  function settings(key,focus){
    if(key!=='appearance'&&key!=='devices')return;
    ['appearance','devices'].forEach(function(name){var active=name===key;el('view-'+name).hidden=!active;el('settings-'+name).setAttribute('aria-selected',String(active));el('settings-'+name).tabIndex=active?0:-1;});
    if(focus)el('settings-'+key).focus();
    if(window.FBPWidgets)FBPWidgets.sync();
    if(window.alignPanelCards)alignPanelCards();
  }
  function keyboard(root,keys,prefix,choose){
    root.addEventListener('keydown',function(event){
      var at=keys.findIndex(function(key){return el(prefix+key)===event.target;});if(at<0)return;
      if(event.key==='ArrowRight')at=(at+1)%keys.length;
      else if(event.key==='ArrowLeft')at=(at+keys.length-1)%keys.length;
      else if(event.key==='Home')at=0;
      else if(event.key==='End')at=keys.length-1;
      else return;
      event.preventDefault();choose(keys[at],true);
    });
  }
  function observe(state){
    if(!state)return;
    Object.assign(controls,state);ready=true;
    var running=!!controls.sb_clockrun;
    el('topClockToggle').textContent=running?'暂停计时':'开始计时';
    el('topClockToggle').disabled=clockBusy;
    el('topClockToggle').setAttribute('aria-label',running?'暂停比赛时钟':'开始比赛时钟');
    el('topClockToggle').setAttribute('aria-pressed',String(running));
    var shown=!!controls.scoreboard_show;
    el('scoreboardToggle').textContent=shown?'比分条已显示':'比分条已隐藏';
    el('scoreboardToggle').setAttribute('aria-pressed',String(shown));el('scoreboardToggle').disabled=visibilityBusy;
    var lineupShown=!!controls.lineup_show;
    el('lineupToggle').textContent=lineupShown?'名单已显示':'名单已隐藏';
    el('lineupToggle').setAttribute('aria-label',lineupShown?'隐藏球员名单':'显示球员名单');
    el('lineupToggle').setAttribute('aria-pressed',String(lineupShown));el('lineupToggle').disabled=lineupBusy;
    if(controls.status&&window.renderMatchStatus)renderMatchStatus(controls.status);
  }
  function toggleClock(){
    if(!ready||clockBusy)return Promise.resolve(null);
    clockBusy=true;el('topClockToggle').disabled=true;el('topClockToggle').setAttribute('aria-busy','true');
    return FBPMatchTiming.clock('toggle').finally(function(){clockBusy=false;el('topClockToggle').removeAttribute('aria-busy');observe(controls);});
  }
  function toggleScoreboard(){
    if(!ready||visibilityBusy)return Promise.resolve(null);
    visibilityBusy=true;el('scoreboardToggle').disabled=true;
    return sendState({scoreboard_show:!controls.scoreboard_show}).finally(function(){visibilityBusy=false;observe(controls);});
  }
  function toggleLineup(){
    if(!ready||lineupBusy)return Promise.resolve(null);
    lineupBusy=true;el('lineupToggle').disabled=true;el('lineupToggle').setAttribute('aria-busy','true');
    var patch={lineup_show:!controls.lineup_show};if(patch.lineup_show)patch.lineup_tick=nTick();
    return sendState(patch).finally(function(){lineupBusy=false;el('lineupToggle').removeAttribute('aria-busy');observe(controls);});
  }
  function init(){
    // Escape the toolbar's backdrop root. Nested backdrop filters cannot blur
    // the page behind them and may leave stale composited tiles when dismissed.
    document.querySelectorAll('.desk-flyout').forEach(function(node){document.body.appendChild(node);});
    var notice=document.createElement('p');notice.id='deskNotice';notice.className='desk-notice';notice.hidden=true;notice.setAttribute('role','alert');document.querySelector('.console-chrome').appendChild(notice);
    var status=el('writeStatus');
    function report(){var text=status.textContent.trim(),problem=/失败|异常|无法|请输入|不能为空|旧版本|请重启/.test(text);if(problem){notice.textContent=text;notice.hidden=false;}else if(text==='已保存'){notice.textContent='';notice.hidden=true;}}
    new MutationObserver(report).observe(status,{childList:true,characterData:true,subtree:true});
    keyboard(document.querySelector('.event-nav'),tasks,'task-',task);
    keyboard(document.querySelector('.settings-nav'),['appearance','devices'],'settings-',settings);
    document.addEventListener('pointerdown',function(event){if(flyout&&!el(flyout).contains(event.target)&&!opener.contains(event.target))closeFlyout(false);});
    document.addEventListener('focusin',function(event){if(flyout&&!el(flyout).contains(event.target)&&!opener.contains(event.target))closeFlyout(false);});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&flyout&&!event.defaultPrevented&&!document.querySelector('select:open')){event.preventDefault();closeFlyout(true);}});
    document.querySelectorAll('.event-stage .btn[onclick]').forEach(function(button){if(/writeGoal\(|writePlayer\(|executeSubstitution\(|clockSet\(/.test(button.getAttribute('onclick')))button.classList.add('primary-action');});
    var chrome=document.querySelector('.console-chrome');
    function height(){document.documentElement.style.setProperty('--console-chrome-height',Math.ceil(chrome.getBoundingClientRect().height)+'px');}
    height();if(window.ResizeObserver)new ResizeObserver(height).observe(chrome);
    settings('appearance');
  }
  window.FBPDesk={init:init,observe:observe,task:task,settings:settings,toggleClock:toggleClock,toggleScoreboard:toggleScoreboard,toggleLineup:toggleLineup,toggleFlyout:toggleFlyout,closeFlyout:closeFlyout};
})();

function applyScoreCorrection(){
  var home=$('scoreHome').value.trim(),away=$('scoreAway').value.trim();
  if(!/^\d{1,3}$/.test(home)||!/^\d{1,3}$/.test(away)){$('writeStatus').textContent='比分请输入 0–999 的整数。';return Promise.resolve(null);}
  return sendState({scoreHome:Number(home),scoreAway:Number(away)}).then(function(res){if(res)FBPDesk.closeFlyout(true);return res;});
}
function saveTeamColors(){return sendState({colorHome:$('colorHome').value,colorAway:$('colorAway').value,...FBPLinks.teamPatch()});}
function confirmResetScore(button){
  if(Number(button.dataset.confirmUntil)>Date.now()){button.dataset.confirmUntil='';button.textContent='比分归零';$('scoreResetNote').textContent='';return quickResetScore();}
  button.dataset.confirmUntil=String(Date.now()+5000);button.textContent='确认归零';$('scoreResetNote').textContent='';
  setTimeout(function(){if(Number(button.dataset.confirmUntil)<=Date.now()){button.textContent='比分归零';$('scoreResetNote').textContent='';}},5100);
}
