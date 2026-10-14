/* Shared form drafts. Team names save on commit; selection never plays an event. */
(function(){
  'use strict';
  var groups=['goal','player','card','restart'],rosters=['xiH','xiA','subH','subA'],people=[],autoNames={},scoreDraft={home:false,away:false},ready=false;
  var active={home:null,away:null},startingSignatures={home:'',away:''},savedSignatures={home:'',away:''},lastSides={};
  var savedNames={home:'',away:''},nameRequests={};
  function el(id){return document.getElementById(id);}
  function number(value){var n=FBPRosterFormat.number(value);return n===null?null:String(Number(n));}
  function team(side){return el(side==='away'?'teamAway':'teamHome').value.trim()||(side==='away'?'客队':'主队');}
  function color(side){return el(side==='away'?'colorAway':'colorHome').value;}
  function sideOf(prefix){return el(prefix+'_side').value==='away'?'away':'home';}
  function message(prefix,text){el(prefix+'_match_hint').textContent=text||'选择球员或输入号码，自动匹配当前球队名单。';}
  function parse(text,side,section){
    return String(text).split(/\r\n|\n|\r/).map(function(line){
      var p=FBPRosterFormat.line(line);if(!p)return null;
      return {num:p.num,keyNum:number(p.num),name:p.name,side:side,section:section};
    }).filter(Boolean);
  }
  function rebuild(){
    var seen={};people=[];
    rosters.forEach(function(key){parse(el(key+'_players').value,key.slice(-1)==='A'?'away':'home',key.startsWith('xi')?'首发':'替补').forEach(function(p){
      var id=p.side+'|'+p.keyNum+'|'+p.name;if(seen[id])return;seen[id]=true;p.id=id;people.push(p);
    });});
    ['home','away'].forEach(function(side){var signature=el(side==='home'?'xiH_players':'xiA_players').value;if(signature!==startingSignatures[side]){active[side]=null;startingSignatures[side]=signature;}});
    groups.forEach(options);subOptions();renderRoster();
  }
  function isIn(p){return Array.isArray(active[p.side])?active[p.side].includes(p.id):p.section==='首发';}
  function renderRoster(){
    var root=el('liveRosters'),signature=JSON.stringify(people.map(function(p){return [p.id,isIn(p),team(p.side)];}));if(root.dataset.signature===signature)return;root.dataset.signature=signature;root.replaceChildren();
    ['home','away'].forEach(function(side){var card=document.createElement('div');card.className='card live-roster';var title=document.createElement('h2');title.textContent=(side==='home'?'主队 · ':'客队 · ')+team(side);card.appendChild(title);
      [true,false].forEach(function(on){var list=people.filter(function(p){return p.side===side&&isIn(p)===on;}),heading=document.createElement('h3');heading.textContent=(on?'场内':'场外')+' · '+list.length+' 人';card.appendChild(heading);var items=document.createElement('div');items.className='roster-chips';items.dataset.side=side;items.dataset.onfield=String(on);list.forEach(function(p){var item=document.createElement('span');item.dataset.player=p.id;item.textContent=p.num+' · '+p.name;items.appendChild(item);});if(!list.length)items.textContent='暂无球员';card.appendChild(items);});root.appendChild(card);
    });
  }
  function options(prefix){
    var select=el(prefix+'_roster_player'),chosen=select.value,side=sideOf(prefix);select.replaceChildren();
    var placeholder=new Option('选择名单中的球员','');select.add(placeholder);
    [true,false].forEach(function(onPitch){
      var entries=people.filter(function(p){return p.side===side&&isIn(p)===onPitch;});if(!entries.length)return;
      var group=document.createElement('optgroup');group.label=onPitch?'场内球员':'场外球员';
      entries.forEach(function(p){group.appendChild(new Option(p.num+' · '+p.name,p.id));});select.appendChild(group);
    });
    select.value=chosen;if(!select.value)select.value='';select.disabled=!people.some(function(p){return p.side===side;});
    el(prefix+'_side').options[0].textContent='主队 · '+team('home');el(prefix+'_side').options[1].textContent='客队 · '+team('away');
    FBPChoices.syncSelects();renderRoster();
  }
  function applyTeam(prefix){var side=sideOf(prefix);el(prefix+'_team').value=team(side);if(el(prefix+'_color'))el(prefix+'_color').value=color(side);}
  function choose(prefix,p){
    el(prefix+'_num').value=p.num;el(prefix+'_name').value=p.name;autoNames[prefix]=p.name;el(prefix+'_roster_player').value=p.id;applyTeam(prefix);syncRestart(prefix);message(prefix,'已匹配：'+team(p.side)+' · '+p.num+'号 '+p.name+'（'+(isIn(p)?'场内':'场外')+'）');FBPWidgets.sync();FBPChoices.syncSelects();
  }
  function syncRestart(prefix){if(prefix==='restart')el('restart_player').value=[el('restart_num').value.trim(),el('restart_name').value.trim()].filter(Boolean).join(' ');}
  function clearAutomaticName(prefix){if(autoNames[prefix]&&el(prefix+'_name').value===autoNames[prefix])el(prefix+'_name').value='';autoNames[prefix]=null;}
  function matchNumber(prefix){
    var n=number(el(prefix+'_num').value),side=sideOf(prefix),matches=people.filter(function(p){return p.side===side&&p.keyNum===n;});
    var onPitch=matches.filter(isIn);if(onPitch.length)matches=onPitch;
    if(matches.length===1){choose(prefix,matches[0]);return;}
    clearAutomaticName(prefix);el(prefix+'_roster_player').value='';
    syncRestart(prefix);FBPChoices.syncSelects();
    message(prefix,matches.length>1?'该号码对应多名球员，请从名单中选择。':n?'当前球队未找到 '+n+'号，可手动填写姓名。':'');
  }
  function changeSide(prefix){
    if(lastSides[prefix]&&lastSides[prefix]!==sideOf(prefix)){el(prefix+'_name').value='';autoNames[prefix]=null;}
    lastSides[prefix]=sideOf(prefix);applyTeam(prefix);options(prefix);matchNumber(prefix);persist('fbp_'+prefix+'_side',sideOf(prefix));FBPWidgets.sync();
  }
  function teamChanged(side){
    var suffix=side==='away'?'A':'H';['xi','sub'].forEach(function(key){el(key+suffix+'_team').value=team(side);el(key+suffix+'_color').value=color(side);});
    groups.forEach(function(prefix){if(sideOf(prefix)===side)applyTeam(prefix);options(prefix);});subOptions();FBPWidgets.sync();
  }
  function teamNamePatch(side,name,state){
    var patch={},suffix=side==='away'?'A':'H';patch[side==='away'?'teamAway':'teamHome']=name;
    ['xi','sub'].forEach(function(prefix){patch[prefix+suffix+'_team']=name;});
    groups.concat('sub').forEach(function(prefix){var saved=state[prefix+'_side'];if(saved!=='home'&&saved!=='away')saved=state[prefix+'_team']===state.teamAway&&state.teamAway!==state.teamHome?'away':'home';if(saved===side)patch[prefix+'_team']=name;});
    return patch;
  }
  function saveTeamName(side){
    var name=el(side==='away'?'teamAway':'teamHome').value.trim();
    if(!name){el('writeStatus').textContent='队名不能为空；已保留原上屏队名。';return Promise.resolve(null);}
    if(nameRequests[side]&&nameRequests[side].name===name)return nameRequests[side].promise;
    if(!nameRequests[side]&&savedNames[side]===name)return Promise.resolve(null);
    // Read saved event sides when this write reaches the queue. D200 or another
    // panel may have changed the prepared event while the operator was typing.
    var request={name:name},base=serverBase;nameRequests[side]=request;
    request.promise=sendState(function(){return fetch(base+'/state.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(state){return teamNamePatch(side,name,state);});}).then(function(result){if(nameRequests[side]===request)delete nameRequests[side];return result;});
    return request.promise;
  }
  function bindTeamName(input,side){
    function commit(){el(side==='away'?'teamAway':'teamHome').value=input.value;teamChanged(side);return saveTeamName(side);}
    input.addEventListener('change',commit);
    input.addEventListener('keydown',function(event){if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();commit();}});
  }
  function setScore(side,value,dirty){
    [side==='home'?'scoreHome':'scoreAway',side==='home'?'goal_scoreHome':'goal_scoreAway'].forEach(function(id){el(id).value=value;});if(dirty!==undefined)scoreDraft[side]=dirty;
  }
  function acceptScores(score){setScore('home',score.home,false);setScore('away',score.away,false);}
  function remoteScore(side,value){
    var ids=side==='home'?['scoreHome','goal_scoreHome']:['scoreAway','goal_scoreAway'];
    if(scoreDraft[side]||ids.some(function(id){return document.activeElement===el(id);}))return false;
    setScore(side,value,false);return true;
  }
  function hydrate(state){
    ['home','away'].forEach(function(side){savedNames[side]=String(state[side==='away'?'teamAway':'teamHome']||'').trim();});
    acceptScores({home:state.scoreHome??0,away:state.scoreAway??0});
    ['side','num','name'].forEach(function(key){if(state['restart_'+key]!==undefined)el('restart_'+key).value=state['restart_'+key];});
    groups.forEach(function(prefix){
      var saved=state[prefix+'_side'];if(saved==='home'||saved==='away')el(prefix+'_side').value=saved;
      else if(state[prefix+'_team']===team('away')&&team('away')!==team('home'))el(prefix+'_side').value='away';
      else if(state[prefix+'_team']===team('home'))el(prefix+'_side').value='home';
    });renderRoster();
    FBPChoices.syncSelects();
    if(state.xiH_players===undefined&&state.lineup_players!==undefined)el('xiH_players').value=state.lineup_players;
    if(state.sub_side==='home'||state.sub_side==='away')el('sub_side').value=state.sub_side;
    rebuild();['home','away'].forEach(function(side){active[side]=Array.isArray(state['onfield_'+side])?state['onfield_'+side]:null;savedSignatures[side]=startingSignatures[side];});groups.forEach(options);subOptions();groups.forEach(function(prefix){
      applyTeam(prefix);var p=people.find(function(p){return p.side===sideOf(prefix)&&p.keyNum===number(el(prefix+'_num').value)&&p.name===el(prefix+'_name').value;});
      if(p){el(prefix+'_roster_player').value=p.id;autoNames[prefix]=p.name;}
      lastSides[prefix]=sideOf(prefix);message(prefix); });['off','on'].forEach(function(d){el('sub_'+d+'_player').value=state['sub_'+d+'_id']||'';selectSub(d);});FBPWidgets.sync();
  }
  function teamPatch(){
    var patch={};['home','away'].forEach(function(side){var suffix=side==='home'?'H':'A';['xi','sub'].forEach(function(prefix){patch[prefix+suffix+'_team']=team(side);patch[prefix+suffix+'_color']=color(side);});});
    groups.forEach(function(prefix){var side=sideOf(prefix);patch[prefix+'_side']=side;patch[prefix+'_team']=team(side);if(el(prefix+'_color'))patch[prefix+'_color']=color(side);});return patch;
  }
  var importedSheets={};
  function importText(text){return FBPRosterFormat.text(text).text;}
  function selectRosterSheet(prefix,index){
    var sheet=importedSheets[prefix]&&importedSheets[prefix][Number(index)];if(!sheet)return;
    if(!sheet.text){log('该工作表未识别到球员，已有名单保留',false);return;}
    el(prefix+'_players').value=sheet.text;rosterEdited();
    log('已导入 '+sheet.count+' 名球员'+(sheet.name?'（'+sheet.name+'）':'')+(sheet.skipped?'，略过 '+sheet.skipped+' 行非名单内容':'')+'，请保存名单',true);
  }
  function importRoster(prefix,input){
    var file=input.files&&input.files[0];if(!file)return;
    var excel=/\.(xlsx|xls|xlsm)$/i.test(file.name),reader=new FileReader();
    reader.onload=function(){try{
      var sheets;
      if(excel){
        var book=XLSX.read(reader.result,{type:'array',cellHTML:false,cellFormula:false});
        sheets=book.SheetNames.map(function(name){var parsed=FBPRosterFormat.rows(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:false,defval:'',blankrows:false}));parsed.name=name;return parsed;});
      }else sheets=[FBPRosterFormat.text(reader.result)];
      var valid=sheets.findIndex(function(s){return s.count>0;});if(valid<0)throw Error('未识别到球员：可使用“1-姓名”“1+姓名”“1号姓名”，或号码/姓名两列');
      importedSheets[prefix]=sheets;
      var menu=el(prefix+'_sheet'),section=el(prefix+'_sheets');menu.replaceChildren();sheets.forEach(function(s,i){var option=new Option((s.name||file.name)+' · '+s.count+' 人',String(i));option.disabled=!s.count;menu.add(option);});
      section.hidden=!excel||sheets.length<2;menu.value=String(valid);selectRosterSheet(prefix,valid);
    }catch(e){log('名单导入失败：'+e.message+'；已有名单保留',false);}finally{input.value='';}};
    reader.onerror=function(){log('名单文件读取失败，已有名单保留',false);input.value='';};
    if(excel)reader.readAsArrayBuffer(file);else reader.readAsText(file,'UTF-8');
  }
  function rosterEdited(){rebuild();groups.forEach(matchNumber);}
  function subOptions(){
    var side=el('sub_side').value;el('sub_side').options[0].textContent='主队 · '+team('home');el('sub_side').options[1].textContent='客队 · '+team('away');
    ['off','on'].forEach(function(direction){var select=el('sub_'+direction+'_player'),chosen=select.value;select.replaceChildren(new Option(direction==='off'?'选择场内下场球员':'选择场外上场球员',''));
      people.filter(function(p){return p.side===side&&isIn(p)===(direction==='off');}).forEach(function(p){select.add(new Option(p.num+' · '+p.name,p.id));});select.value=chosen;if(!select.value){select.value='';if(chosen){el('sub_'+direction+'_num').value='';el('sub_'+direction+'_name').value='';}}select.disabled=select.options.length===1;
    });
  }
  function selectSub(direction){var select=el('sub_'+direction+'_player'),p=people.find(function(p){return p.id===select.value;});if(!p)return;el('sub_'+direction+'_num').value=p.num;el('sub_'+direction+'_name').value=p.name;el('sub_match_hint').textContent='选择完成后，点击执行换人更新场内名单并上屏。';}
  function matchSubNumber(direction){var n=number(el('sub_'+direction+'_num').value),matches=people.filter(function(p){return p.side===el('sub_side').value&&p.keyNum===n&&isIn(p)===(direction==='off');});el('sub_'+direction+'_player').value='';el('sub_'+direction+'_name').value='';
    if(matches.length===1){el('sub_'+direction+'_player').value=matches[0].id;selectSub(direction);}else el('sub_match_hint').textContent=matches.length>1?'该号码对应多名球员，请从换人选项中选择。':'当前'+(direction==='off'?'场内':'场外')+'未找到该号码。';
  }
  function substitutionPatch(play){
    var side=el('sub_side').value,off=people.find(function(p){return p.id===el('sub_off_player').value;}),incoming=people.find(function(p){return p.id===el('sub_on_player').value;});
    if(!off||!incoming||off.side!==side||incoming.side!==side||!isIn(off)||isIn(incoming)){log('请选择场内下场球员与场外上场球员',false);return null;}
    var suffix=side==='home'?'H':'A',patch={sub_side:side,sub_off_id:off.id,sub_on_id:incoming.id,sub_off_num:off.num,sub_off_name:off.name,sub_on_num:incoming.num,sub_on_name:incoming.name,sub_team:team(side),sub_color:color(side)};
    if(play){patch['xi'+suffix+'_players']=el('xi'+suffix+'_players').value;patch['sub'+suffix+'_players']=el('sub'+suffix+'_players').value;patch[side==='home'?'teamHome':'teamAway']=team(side);patch[side==='home'?'colorHome':'colorAway']=color(side);patch.sub_trigger='show';patch.sub_tick=nTick();}
    return patch;
  }
  function liveRoster(onfield){if(!onfield)return;var changed=false;['home','away'].forEach(function(side){if(startingSignatures[side]!==savedSignatures[side]||!Array.isArray(onfield[side]))return;if(JSON.stringify(active[side])!==JSON.stringify(onfield[side])){active[side]=onfield[side];changed=true;}});if(changed){groups.forEach(function(prefix){options(prefix);var p=people.find(function(p){return p.id===el(prefix+'_roster_player').value;});if(p)message(prefix,'已匹配：'+team(p.side)+' · '+p.num+'号 '+p.name+'（'+(isIn(p)?'场内':'场外')+'）');});subOptions();}FBPChoices.syncSelects();renderRoster();}
  function saved(patch){
    ['home','away'].forEach(function(side){var key=side==='home'?'xiH_players':'xiA_players';if(Object.prototype.hasOwnProperty.call(patch,key))savedSignatures[side]=String(patch[key]);var nameKey=side==='home'?'teamHome':'teamAway';if(patch[nameKey]!==undefined)savedNames[side]=String(patch[nameKey]).trim();});
  }
  function init(){
    if(ready)return;ready=true;
    [['scoreHome','home'],['goal_scoreHome','home'],['scoreAway','away'],['goal_scoreAway','away']].forEach(function(entry){el(entry[0]).addEventListener('input',function(){setScore(entry[1],this.value,true);});});
    groups.forEach(function(prefix){
      el(prefix+'_side').addEventListener('change',function(){changeSide(prefix);});
      el(prefix+'_roster_player').addEventListener('change',function(){var id=this.value,p=people.find(function(p){return p.id===id;});if(p)choose(prefix,p);});
      el(prefix+'_num').addEventListener('input',function(){matchNumber(prefix);});
      el(prefix+'_name').addEventListener('input',function(){autoNames[prefix]=null;el(prefix+'_roster_player').value='';syncRestart(prefix);message(prefix,'当前使用手动填写的姓名。');});
    });
    rosters.forEach(function(prefix){el(prefix+'_players').addEventListener('input',rosterEdited);el(prefix+'_players').addEventListener('change',rosterEdited);
      bindTeamName(el(prefix+'_team'),prefix.slice(-1)==='A'?'away':'home');
      ['team','color'].forEach(function(key){el(prefix+'_'+key).addEventListener('input',function(){var side=prefix.slice(-1)==='A'?'away':'home';el((key==='team'?'team':'color')+(side==='away'?'Away':'Home')).value=this.value;teamChanged(side);});});
    });
    ['home','away'].forEach(function(side){bindTeamName(el(side==='away'?'teamAway':'teamHome'),side);['team','color'].forEach(function(key){el(key+(side==='away'?'Away':'Home')).addEventListener('input',function(){teamChanged(side);});});});
    el('sub_side').addEventListener('change',function(){['off','on'].forEach(function(d){el('sub_'+d+'_num').value='';el('sub_'+d+'_name').value='';el('sub_'+d+'_player').value='';});subOptions();});
    ['off','on'].forEach(function(d){el('sub_'+d+'_player').addEventListener('change',function(){selectSub(d);});el('sub_'+d+'_num').addEventListener('input',function(){matchSubNumber(d);});});
    rebuild();
  }
  window.FBPLinks={init:init,hydrate:hydrate,setScore:setScore,acceptScores:acceptScores,remoteScore:remoteScore,teamPatch:teamPatch,saveTeamName:saveTeamName,changeSide:changeSide,rebuild:rosterEdited,importRoster:importRoster,importText:importText,selectRosterSheet:selectRosterSheet,substitutionPatch:substitutionPatch,liveRoster:liveRoster,saved:saved,isScoreDraft:function(side){return scoreDraft[side];}};
})();
