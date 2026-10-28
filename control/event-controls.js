/* Shared event actions: save drafts, execute saved content, or commit both. */
(function(){
  'use strict';
  var fields={goal:['side','name','num','team','color','scoreHome','scoreAway'],card:['type','side','num','name','team','reason'],player:['side','name','num','team','pos','event','color'],restart:['type','side','num','name','team','player','text','color']};
  var cardTypes=['yellow','red'],restartTypes=['kickoff','throwin','corner','goalkick','freekick','penalty'];
  var dirty={card_type:false,restart_type:false},busy={};
  function el(id){return document.getElementById(id);}
  function readState(){return fetch(serverBase+'/state.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('无法读取已保存内容');return r.json();});}
  function timerPreset(s){
    var p=s.clock_preset;
    return p&&typeof p==='object'?p:{label:s.clock_label||'',sub:s.clock_sub||'',mode:s.clock_mode||'down',mm:s.clock_mm===undefined?15:s.clock_mm,ss:s.clock_ss||0,color:s.clock_color||'#FFD400'};
  }
  function timerPatch(p){return {clock_label:p.label,clock_sub:p.sub,clock_mode:p.mode,clock_mm:p.mm,clock_ss:p.ss,clock_color:p.color};}
  function draft(kind,play){
    if(kind==='sub'){
      var sub=FBPLinks.substitutionPatch(play);
      if(!sub)throw Error('请选择场内下场球员与场外上场球员');
      return sub;
    }
    if(kind==='timer'){
      var p={label:el('clock_label').value,sub:el('clock_sub').value,mode:el('clock_mode').value,mm:Number(el('clock_mm').value),ss:Number(el('clock_ss').value),color:el('clock_color').value};
      if(!Number.isInteger(p.mm)||p.mm<0||p.mm>9999||!Number.isInteger(p.ss)||p.ss<0||p.ss>59)throw Error('计时器请输入 0–9999 分钟、0–59 秒');
      return Object.assign(timerPatch(p),{clock_preset:p});
    }
    var patch={};fields[kind].forEach(function(key){patch[kind+'_'+key]=el(kind+'_'+key).value;});
    if(kind==='player')patch.player_title=patch.player_event.trim()||'球员信息';
    return patch;
  }
  function command(kind,saved){
    if(kind==='goal')return {goal_trigger:'goal',goal_tick:nTick()};
    if(kind==='player')return {player_trigger:'show',player_tick:nTick()};
    if(kind==='sub')return {sub_trigger:'show',sub_tick:nTick()};
    if(kind==='timer')return Object.assign(timerPatch(timerPreset(saved)),{clock_cmd:'set',clock_tick:nTick(),clock_show:true});
    var types=kind==='card'?cardTypes:restartTypes,type=saved[kind+'_type']||types[0];
    if(types.indexOf(type)<0)throw Error('请先选择事件类型并保存');
    var patch={};patch[kind+'_trigger']=type;patch[kind+'_tick']=nTick();return patch;
  }
  function checkSubService(){
    return fetch(serverBase+'/api/d200/status',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('无法检查换人服务');return r.json();}).then(function(s){
      if(!s.onfield||!Array.isArray(s.onfield.home)||!Array.isArray(s.onfield.away))throw Error('当前换人服务是旧版本，请重启控制服务后执行');
      FBPLinks.liveRoster(s.onfield);
    });
  }
  function feedback(message){el('writeStatus').textContent='操作失败：'+message;log(message,false);}
  function run(kind,mode){
    if(!['goal','card','sub','player','restart','timer'].includes(kind)||!['save-execute','save','execute'].includes(mode)||busy[kind])return Promise.resolve(null);
    var patch,combined=mode==='save-execute',withScore=combined&&kind==='goal'&&el('goal_sync').checked;
    try{
      if(mode!=='execute'){
        patch=draft(kind,combined);
        if(combined){Object.assign(patch,command(kind,patch));
          if(withScore){patch[patch.goal_side==='away'?'scoreAway_delta':'scoreHome_delta']=1;patch.score_trigger='flash';patch.score_tick=nTick();}
        }
      }
    }catch(e){feedback(e.message);return Promise.resolve(null);}
    busy[kind]=true;
    var buttons=el('event-'+kind).querySelectorAll('.event-actions button');buttons.forEach(function(button){button.disabled=true;button.setAttribute('aria-busy','true');});
    return sendState(function(){
      var ready=kind==='sub'&&mode!=='save'?checkSubService():Promise.resolve();
      return ready.then(function(){return mode==='execute'?readState().then(function(saved){return command(kind,saved);}):patch;});
    }).then(function(result){
      if(result){if(kind==='goal'&&combined)el('goal_sync').checked=false;log(mode==='save'?'内容已保存':combined?'内容已保存并执行':'已执行保存的内容',true);}
      return result;
    }).finally(function(){busy[kind]=false;buttons.forEach(function(button){button.disabled=false;button.removeAttribute('aria-busy');});});
  }
  function observe(controls){
    if(!controls)return;
    ['card_type','restart_type'].forEach(function(id){if(!dirty[id]&&controls[id]){var types=id==='card_type'?cardTypes:restartTypes;if(types.includes(controls[id]))el(id).value=controls[id];}});
  }
  function saved(patch){['card_type','restart_type'].forEach(function(id){if(patch[id]!==undefined&&patch[id]===el(id).value)dirty[id]=false;});}
  function hydrate(state){
    ['card_type','restart_type'].forEach(function(id){dirty[id]=false;var types=id==='card_type'?cardTypes:restartTypes;el(id).value=types.includes(state[id])?state[id]:types[0];});
    if(state.clock_preset){var p=timerPreset(state);Object.keys(timerPatch(p)).forEach(function(key){el(key).value=timerPatch(p)[key];});}
  }
  function init(){['card_type','restart_type'].forEach(function(id){el(id).addEventListener('change',function(){dirty[id]=true;});});}
  window.FBPEvents={init:init,run:run,observe:observe,saved:saved,hydrate:hydrate};
})();
