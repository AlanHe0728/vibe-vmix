/* Preview preferences stay in this browser. Only positions/scales use saveEdit. */
(function(){
  'use strict';
  var KEY='fbp_editor_preferences_v1',names={sb:'比分条',clk:'计时器',rst:'发球',card:'红黄牌',ply:'球员条',goal:'进球',sub:'换人',lineup:'名单',logo:'角标 Logo'};
  var settings={ratio:'16:9',ratioW:16,ratioH:9,guides:true,grid:false,snap:false,step:20,alignTo:'title',hidden:{}},guides,dragging=false,queued=0;
  function valid(next){
    next=next||{};var out=Object.assign({},settings,next);
    if(!/^(16:9|4:3|1:1|9:16|21:9|custom)$/.test(out.ratio))out.ratio='16:9';
    ['ratioW','ratioH'].forEach(function(k){out[k]=Math.max(1,Math.min(10000,Number(out[k])||settings[k]));});
    out.step=Math.max(5,Math.min(200,Number(out.step)||20));
    ['guides','grid','snap'].forEach(function(k){out[k]=!!out[k];});
    if(['frame','action','title'].indexOf(out.alignTo)<0)out.alignTo='title';
    var hidden={};Object.keys(names).forEach(function(id){hidden[id]=!!(out.hidden&&out.hidden[id]);});out.hidden=hidden;return out;
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch(_){} }
  function frameRect(){
    var parts=settings.ratio==='custom'?[settings.ratioW,settings.ratioH]:settings.ratio.split(':').map(Number),r=parts[0]/parts[1];
    var w=Math.min(1920,1080*r),h=w/r;return {x:(1920-w)/2,y:(1080-h)/2,width:w,height:h};
  }
  function inset(rect,fraction){return {x:rect.x+rect.width*(1-fraction)/2,y:rect.y+rect.height*(1-fraction)/2,width:rect.width*fraction,height:rect.height*fraction};}
  function guideRect(){var r=frameRect();return settings.alignTo==='frame'?r:inset(r,settings.alignTo==='action'?.95:.90);}
  function place(el,r){el.style.left=r.x+'px';el.style.top=r.y+'px';el.style.width=r.width+'px';el.style.height=r.height+'px';}
  function draw(){
    if(!guides)return;var rect=frameRect();place(guides.querySelector('.composition-frame'),rect);place(guides.querySelector('.editor-grid'),rect);
    place(guides.querySelector('.guide-action'),inset(rect,.95));place(guides.querySelector('.guide-title'),inset(rect,.90));
    var center=guides.querySelector('.guide-center');place(center,{x:rect.x+rect.width/2,y:rect.y+rect.height/2,width:rect.width/2,height:rect.height/2});
    guides.querySelectorAll('.safe-guide').forEach(function(el){el.classList.toggle('guide-hidden',!settings.guides);});
    guides.querySelector('.composition-frame .guide-label').textContent=(settings.ratio==='custom'?settings.ratioW+':'+settings.ratioH:settings.ratio)+' · 预览构图范围';
    guides.style.setProperty('--grid-step',settings.step+'px');guides.classList.toggle('show-grid',settings.grid||dragging);
  }
  function available(){return Object.keys(names).filter(function(id){return !$(id).classList.contains('isolated-out');});}
  function snapshot(){
    var id=selectedId,el=id&&$(id),x=el?parseFloat(el.style.left):null,y=el?parseFloat(el.style.top):null;
    return {selected:id,x:x,y:y,scale:id?(SCALE[id]||1):1,status:$('saveStatus').textContent,
      settings:settings,frame:frameRect(),layers:available().map(function(k){return {id:k,name:names[k],hidden:!!settings.hidden[k]};})};
  }
  function notify(){
    if(!window.EDIT||queued)return;queued=requestAnimationFrame(function(){queued=0;
      if(parent!==window)parent.postMessage({type:'fbp-editor',snapshot:snapshot()},location.origin);
    });
  }
  function refresh(){
    if(!window.EDIT||!guides)return;var changed=false;Object.keys(names).forEach(function(id){var el=$(id);if(el.classList.contains('editor-hidden')!==!!settings.hidden[id])changed=true;el.classList.toggle('editor-hidden',!!settings.hidden[id]);});if(changed)fitBroadcastText();draw();notify();
  }
  function configure(patch){if(!window.EDIT)return;settings=valid(patch);persist();refresh();}
  function select(id){if(!window.EDIT||available().indexOf(id)<0)return;settings.hidden[id]=false;persist();refresh();selectEl(id);}
  function hide(id,hidden){if(!window.EDIT||!names[id])return;settings.hidden[id]=!!hidden;if(hidden&&selectedId===id)clearSel();persist();refresh();}
  function isolate(){if(!selectedId)return;var id=selectedId;available().forEach(function(k){settings.hidden[k]=k!==id;});persist();refresh();}
  function restore(){settings.hidden={};persist();refresh();}
  function snap(x,y){var r=frameRect();return settings.snap?{x:r.x+Math.round((x-r.x)/settings.step)*settings.step,y:r.y+Math.round((y-r.y)/settings.step)*settings.step}:{x:x,y:y};}
  function drag(active){dragging=!!active;draw();notify();}
  function position(x,y){
    if(!window.EDIT||!selectedId||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return;
    var id=selectedId,el=$(id),pos={x:Math.round(Number(x)),y:Math.round(Number(y))},patch={};
    DRAG[id]=true;el.style.left=pos.x+'px';el.style.top=pos.y+'px';patch[id+'_pos']=pos;notify();
    return saveEdit(id,patch).then(notify);
  }
  function align(direction){
    if(!selectedId)return;var el=$(selectedId),box=el.getBoundingClientRect(),r=guideRect(),x=parseFloat(el.style.left),y=parseFloat(el.style.top);
    if(direction==='left')x=r.x+box.width/2;if(direction==='right')x=r.x+r.width-box.width/2;if(direction==='center')x=r.x+r.width/2;
    if(direction==='top')y=r.y+box.height/2;if(direction==='bottom')y=r.y+r.height-box.height/2;if(direction==='middle')y=r.y+r.height/2;
    return position(x,y);
  }
  function scale(value,commit){
    if(!window.EDIT||!selectedId)return;scSlider.value=Math.max(.3,Math.min(3,Number(value)||1));scSlider.dispatchEvent(new Event('input',{bubbles:true}));
    if(commit)scSlider.dispatchEvent(new Event('change',{bubbles:true}));notify();
  }
  function finishScale(){if(scSlider)scSlider.dispatchEvent(new Event('change',{bubbles:true}));notify();}
  function embed(){if(window.EDIT)document.body.classList.add('embedded-editor');notify();}
  function init(){
    if(!window.EDIT)return;try{settings=valid(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(_){settings=valid({});}
    guides=document.createElement('div');guides.id='layoutGuides';guides.setAttribute('aria-hidden','true');
    guides.innerHTML='<div class="composition-frame safe-guide"><span class="guide-label"></span></div><div class="editor-grid"></div><div class="guide-action safe-guide"><span class="guide-label">画面安全 95%</span></div><div class="guide-title safe-guide"><span class="guide-label">文字安全 90%</span></div><div class="guide-center safe-guide"></div>';
    $('canvas').appendChild(guides);refresh();
    $('canvas').addEventListener('pointerdown',function(e){if(!e.target.closest('.pos'))clearSel();});
    window.addEventListener('storage',function(e){if(e.key===KEY){try{settings=valid(JSON.parse(e.newValue||'{}'));refresh();}catch(_){}}});
    if(ONLY&&names[ONLY])select(ONLY);
  }
  window.FBPEditor={init:init,refresh:refresh,notify:notify,snapshot:snapshot,configure:configure,select:select,hide:hide,isolate:isolate,restore:restore,snap:snap,drag:drag,position:position,align:align,scale:scale,finishScale:finishScale,embed:embed};
})();
