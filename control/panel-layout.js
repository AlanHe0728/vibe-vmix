/* Layout interactions are read-only; existing panel commands own all state writes. */
var PANEL_TABS=['match','events','lineups','appearance','devices'];
var LIVE_CLOCK=null;
function selectPanelTab(key,instant){
  if(PANEL_TABS.indexOf(key)<0)return;
  PANEL_TABS.forEach(function(name){
    var active=name===key,tab=document.getElementById('tab-'+name);
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    document.getElementById('view-'+name).hidden=!active;
  });
  FBPWidgets.updateTabs(instant);
  alignPanelCards();
  var main=document.getElementById('main');
  if(window.scrollY>main.offsetTop){
    var sticky=document.querySelector(matchMedia('(max-width:760px)').matches?'.panel-nav':'.app-header');
    window.scrollTo(0,Math.max(0,main.offsetTop-sticky.offsetHeight));
  }
}
function togglePanelLog(){
  var log=document.getElementById('log');log.classList.toggle('collapsed');
  document.querySelector('.log-toggle').setAttribute('aria-expanded',String(!log.classList.contains('collapsed')));
}
function initPanelLayout(){
  FBPWidgets.init();
  structurePanelCards();
  alignPanelCards();
  window.addEventListener('resize',alignPanelCards);
  if(document.fonts)document.fonts.ready.then(alignPanelCards);
  document.querySelector('.panel-nav').addEventListener('keydown',function(event){
    var index=PANEL_TABS.findIndex(function(key){return document.getElementById('tab-'+key)===event.target;});
    if(index<0)return;
    if(event.key==='ArrowRight')index=(index+1)%PANEL_TABS.length;
    else if(event.key==='ArrowLeft')index=(index+PANEL_TABS.length-1)%PANEL_TABS.length;
    else if(event.key==='Home')index=0;
    else if(event.key==='End')index=PANEL_TABS.length-1;
    else return;
    event.preventDefault();selectPanelTab(PANEL_TABS[index],true);
    document.getElementById('tab-'+PANEL_TABS[index]).focus();
  });
  // Associate incumbent field labels without changing any ids or command bindings.
  document.querySelectorAll('.frow label').forEach(function(label){
    if(label.htmlFor||label.querySelector('input'))return;
    var next=label.nextElementSibling;
    if(next&&/^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName)&&next.id)label.htmlFor=next.id;
  });
  document.querySelectorAll('input,select,textarea').forEach(function(field){
    if(field.labels.length||field.getAttribute('aria-label'))return;
    var row=field.closest('.frow'),group=field.closest('.grp'),card=field.closest('.card');
    var label=(row&&row.querySelector('label'))||(group&&group.querySelector('.gl'))||(card&&card.querySelector('h2'));
    var special={singleUrl:'vMix 单链接上屏地址',vmixApi:'vMix API 地址',overlayInput:'叠层通道',overlaySrc:'vMix 网页输入',clock_ss:'秒',scoreAway:'客队比分',scoreHome:'主队比分',goal_scoreAway:'进球画面客队比分',goal_scoreHome:'进球画面主队比分',font_family:'自定义字体字族名'};
    field.setAttribute('aria-label',special[field.id]||field.title||field.placeholder||(label?label.textContent.trim():field.id));
  });
  setInterval(renderLiveClock,250);
}
// Pair complete cards, not just individual input heights. Moving the existing
// nodes preserves command bindings, uploaded files and unsaved drafts.
function structurePanelCards(){
  document.querySelectorAll('.card-grid>div.card:not(.logo-card)').forEach(function(card){
    var header=document.createElement('div');header.className='card-header';
    var h=card.querySelector('h2');header.appendChild(h);
    while(card.firstElementChild&&card.firstElementChild.matches('.note,.section-note'))header.appendChild(card.firstElementChild);
    var footer=card.querySelector(':scope>.card-footer');
    if(!footer){
      footer=document.createElement('div');footer.className='card-footer';
      var actions=Array.from(card.children).filter(function(el){return el.matches('.btns,.grp');}).pop();
      if(actions){
        // Timer visibility is a separate footer; timer commands remain beside
        // the clock settings in the body.
        if(card.querySelector('#clock_mode')){
          var visibility=actions.lastElementChild;
          var label=document.createElement('div');label.className='gl';label.textContent='计时器上屏';
          footer.appendChild(label);footer.appendChild(visibility);
        }else{
          var next=actions.nextElementSibling;footer.appendChild(actions);
          while(next){var after=next.nextElementSibling;footer.appendChild(next);next=after;}
        }
      }
    }else footer.remove();
    var body=document.createElement('div');body.className='card-body';
    while(card.firstChild)body.appendChild(card.firstChild);
    card.appendChild(header);card.appendChild(body);card.appendChild(footer);
    if(window.ResizeObserver)new ResizeObserver(alignPanelCards).observe(body);
  });
}
var ALIGN_FRAME=0;
function alignPanelCards(){
  if(ALIGN_FRAME)return;
  ALIGN_FRAME=requestAnimationFrame(function(){
    ALIGN_FRAME=0;
    document.querySelectorAll('.card-header,.card-footer').forEach(function(el){el.style.minHeight='';if(el.classList.contains('card-footer'))el.style.paddingTop='';});
    if(matchMedia('(max-width:760px)').matches)return;
    document.querySelectorAll('section:not([hidden]) .card-grid').forEach(function(grid){
      var cards=Array.from(grid.children).filter(function(el){return el.matches('div.card:not(.logo-card)');});
      for(var i=0;i+1<cards.length;i+=2){
        ['.card-header','.card-footer'].forEach(function(selector){
          var a=cards[i].querySelector(selector),b=cards[i+1].querySelector(selector);
          if(selector==='.card-footer'){
            var ab=a.querySelector('.btn'),bb=b.querySelector('.btn');
            if(ab&&bb){
              var ao=ab.getBoundingClientRect().top-a.getBoundingClientRect().top;
              var bo=bb.getBoundingClientRect().top-b.getBoundingClientRect().top;
              a.style.paddingTop=(20+Math.max(ao,bo)-ao)+'px';
              b.style.paddingTop=(20+Math.max(ao,bo)-bo)+'px';
            }
          }
          var height=Math.max(a.getBoundingClientRect().height,b.getBoundingClientRect().height);
          a.style.minHeight=b.style.minHeight=height+'px';
        });
      }
    });
  });
}
function renderLiveFields(state,score){
  if(state.teamHome!==undefined)document.getElementById('liveHome').textContent=state.teamHome||'主队';
  if(state.teamAway!==undefined)document.getElementById('liveAway').textContent=state.teamAway||'客队';
  if(score)document.getElementById('liveScore').textContent=score.home+' : '+score.away;
  else if(state.scoreHome!==undefined&&state.scoreAway!==undefined)document.getElementById('liveScore').textContent=state.scoreHome+' : '+state.scoreAway;
}
function renderLiveStatus(state){
  renderLiveFields({},state.score);
  LIVE_CLOCK={clock:state.sb_clock,received:Date.now()};
  renderLiveClock();
}
function renderLiveClock(){
  if(!LIVE_CLOCK)return;
  var clock=LIVE_CLOCK.clock,age=Date.now()-LIVE_CLOCK.received;
  if(age>4000){document.getElementById('liveClockState').textContent='状态同步中断';return;}
  var seconds=Math.floor(Math.max(0,clock.milliseconds+(clock.running?age*(clock.mode==='down'?-1:1):0))/1000);
  document.getElementById('liveClock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  document.getElementById('liveClockState').textContent=clock.running?'比赛计时中':'比赛计时暂停';
}
