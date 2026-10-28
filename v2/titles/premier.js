/* V2-only renderer extension. The original renderer and its data stay intact. */
(function(){
 'use strict';
 var EASE='cubic-bezier(.23,1,.32,1)',EXIT='cubic-bezier(.77,0,.175,1)';
 var basePos={sb:[430,120],clk:[960,430],rst:[440,910],card:[440,910],ply:[440,910],goal:[960,890],sub:[490,820],logo:[1760,96],lineup:[960,540]};
 Object.keys(basePos).forEach(function(k){POS_DEF[k]={x:basePos[k][0],y:basePos[k][1],s:1};});
 var mark=document.createElement('span');mark.className='league-mark';mark.innerHTML='<img alt="" src="assets/icons/football.svg">';$('sbMid').appendChild(mark);
 $('sbMid').querySelector('.sc>span:nth-child(2)').className='score-separator';
 window.applyTheme=function(){
  document.body.style.fontFamily=field('theme_font','Outfit, Microsoft YaHei, sans-serif');
  var bg=String(field('theme_bg','')).trim();document.body.style.background=/^data:image\//i.test(bg)?'url('+JSON.stringify(bg)+') center / cover no-repeat':(bg||'transparent');
  setCss('--pl',({dark:'#37003c',deep:'#25002b',night:'#4d1757'})[field('theme_skin','dark')]||'#37003c');
  setVar('--mint',field('theme_accent','#008c6b'));
  var mode=field('motion','smooth'),curve=mode==='lively'?'cubic-bezier(.16,1,.3,1)':mode==='linear'?'linear':EASE;
  setCss('--wipe-ease-in',curve);setCss('--wipe-ease-out',mode==='linear'?'linear':EXIT);setCss('--ease',curve);
  setCss('--wipe-in',wipeSeconds('in')+'s');setCss('--wipe-out',wipeSeconds('out')+'s');
  injectFont();
 };
 window.wipeSeconds=function(direction){var n=Number(field('wipe_'+direction,direction==='in'?.56:.32));if(!isFinite(n))n=direction==='in'?.56:.32;return Math.max(.1,Math.min(5,n))*Math.max(.4,Math.min(2.5,+field('animdur',1)||1));};
 window.fitScoreboardWidth=function(){
  var wrap=$('sb').querySelector('.sb-wrap'),logos=truthy(field('sb_logos_show',true)),lane=logos?186:140,mid=178;
  wrap.classList.toggle('without-logos',!logos);
  ['sbHome','sbAway'].forEach(function(id){var e=$(id);e.style.fontSize='';var st=getComputedStyle(e);SB_MEASURE.font=st.fontWeight+' '+st.fontSize+' '+st.fontFamily;lane=Math.max(lane,Math.ceil(SB_MEASURE.measureText(e.textContent).width+42+(logos?48:0)));});
  SB_MEASURE.font='750 48px Outfit';mid=Math.max(mid,SB_MEASURE.measureText(String(field('scoreHome',0))+String(field('scoreAway',0))).width+90);
  lane=Math.min(lane,(1680-mid)/2);wrap.style.setProperty('--sb-width',(lane*2+mid)+'px');wrap.style.setProperty('--sb-mid',mid+'px');
  numberColors(document.documentElement,String(field('colorHome','#222b52')));setCss('--home-ink',getComputedStyle(document.documentElement).getPropertyValue('--number-ink'));
  numberColors(document.documentElement,String(field('colorAway','#85b5dc')));setCss('--away-ink',getComputedStyle(document.documentElement).getPropertyValue('--number-ink'));
  var src=String(field('logo_data',''));mark.classList.toggle('custom',/^data:image\//i.test(src));mark.querySelector('img').src=/^data:image\//i.test(src)?src:'assets/icons/football.svg';
 };
 function playerCell(pair,incoming,index){var row=document.createElement('div');row.className='swap-player'+(incoming?' incoming':'');var n=document.createElement('span');n.className='swap-num num';n.textContent=pair[incoming?'on_num':'off_num']||'--';var name=document.createElement('span');name.className='swap-name';name.textContent=pair[incoming?'on_name':'off_name']||'';name.title=name.textContent;if(index===0){n.id=incoming?'subOnNum':'subOffNum';name.id=incoming?'subOnName':'subOffName';}row.append(n,name);return row;}
 function buildSub(){
  var batch=Array.isArray(S.sub_batch)&&S.sub_batch.length?S.sub_batch:[{off_num:field('sub_off_num','--'),off_name:field('sub_off_name','下场球员'),on_num:field('sub_on_num','--'),on_name:field('sub_on_name','上场球员')}];
  var root=$('sub').querySelector('.swap');root.replaceChildren();var title=document.createElement('div');title.className='swap-title';var team=document.createElement('span');team.id='subTeam';team.textContent=field('sub_team','球队');var label=document.createElement('span');label.textContent='换人';title.append(team,label);root.appendChild(title);
  var head=document.createElement('div');head.className='swap-grid-head';head.innerHTML='<span><i class="swap-direction-icon"></i>下场</span><span class="incoming"><i class="swap-direction-icon"></i>上场</span>';root.appendChild(head);
  batch.forEach(function(pair,index){var row=document.createElement('div');row.className='swap-pair';row.append(playerCell(pair,false,index),playerCell(pair,true,index));root.appendChild(row);});
 }
 window.subShow=function(){buildSub();fitBroadcastText();showFor('sub',Math.max(6000,(Array.isArray(S.sub_batch)?S.sub_batch.length:1)*1600));interrupt('sub');};
 var visible=setGraphicVisible;
 window.setGraphicVisible=function(id,show){var was=$(id).classList.contains('on');visible(id,show);if(show&&!was)detailReveal(id);};
 var replay=replayWipe;
 window.replayWipe=function(id){var seconds=replay(id);if(seconds)detailReveal(id,wipeSeconds('out')*1000);return seconds;};
 function detailReveal(id,delay){
  if(EDIT||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var rows=$(id).querySelectorAll('.swap-pair,.lu-row');
  rows.forEach(function(row,index){if(row._plMotion)row._plMotion.cancel();row._plMotion=row.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:(delay||0)+Math.min(index,12)*35,easing:EASE,fill:'backwards'});});
 }
 var buildLineup=luBuild;
 window.luBuild=function(){buildLineup();if($('lineup').classList.contains('on'))detailReveal('lineup');};
 if(EDIT)buildSub();
 Object.keys(POS_DEF).forEach(function(key){applyPos(key,key);});
 if(Object.keys(S).length)applyState(S,true);
 window.FBPPremier={buildSub:buildSub};
})();
