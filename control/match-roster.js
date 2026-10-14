// Atomic substitutions share the same roster identity as the control form.
const format=require('./roster-format');
function players(state,side,startingOnly=false){
  const suffix=side==='away'?'A':'H',seen=new Set(),result=[];
  for(const prefix of startingOnly?['xi']:['xi','sub']){
    const text=state[prefix+suffix+'_players']??(prefix==='xi'&&suffix==='H'?state.lineup_players:'')??'';
    for(const line of String(text).split(/\r\n|\n|\r/)){
      const p=format.line(line);if(!p)continue;
      const id=side+'|'+Number(p.num)+'|'+p.name;if(seen.has(id))continue;seen.add(id);result.push({id,num:p.num,name:p.name});
    }
  }
  return result;
}
function onfield(state,side){return Array.isArray(state['onfield_'+side])?state['onfield_'+side].filter(id=>players(state,side).some(p=>p.id===id)):players(state,side,true).map(p=>p.id);}
function migrateRoster(state){
  for(const side of ['home','away']){
    if(Array.isArray(state['onfield_'+side]))continue;
    let active=onfield(state,side);
    // Older servers saved only the last substitution title. Recover that recorded
    // exchange once, without triggering a new title or changing the original XI.
    if(state.sub_side===side&&state.sub_trigger==='show'&&state.sub_tick&&active.includes(state.sub_off_id)&&!active.includes(state.sub_on_id)&&players(state,side).some(p=>p.id===state.sub_on_id))active=active.map(id=>id===state.sub_off_id?state.sub_on_id:id);
    state['onfield_'+side]=active;
  }
  return state;
}
function applyRoster(current,state,patch){
  for(const side of ['home','away']){
    const key=side==='home'?'xiH_players':'xiA_players';
    if(Object.hasOwn(patch,key)&&patch[key]!==current[key])state['onfield_'+side]=players(state,side,true).map(p=>p.id);
  }
  if(patch.sub_trigger!=='show'||!Object.hasOwn(patch,'sub_tick'))return;
  const side=state.sub_side==='away'?'away':'home',all=players(state,side),active=onfield(state,side);
  const off=all.find(p=>p.id===state.sub_off_id),incoming=all.find(p=>p.id===state.sub_on_id);
  if(!off||!incoming||off.id===incoming.id||!active.includes(off.id)||active.includes(incoming.id))throw Error('换人无效：请选择场内下场球员与场外上场球员');
  state['onfield_'+side]=active.map(id=>id===off.id?incoming.id:id);
  state.sub_off_num=off.num;state.sub_off_name=off.name;state.sub_on_num=incoming.num;state.sub_on_name=incoming.name;
  state.sub_team=state[side==='away'?'teamAway':'teamHome']||(side==='away'?'客队':'主队');state.sub_color=state[side==='away'?'colorAway':'colorHome']||(side==='away'?'#00529f':'#c8102e');
}
module.exports={players,onfield,applyRoster,migrateRoster};
