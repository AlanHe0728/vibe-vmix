const catalog = require('./d200-actions.json');
const {value} = require('./clock-state');
const {onfield}=require('./match-roster');
const truthy = v => v===true || v===1 || v==='1' || v==='true';
const score = v => Number.isFinite(Number(v)) ? Math.max(0,Math.floor(Number(v))) : 0;
function patchFor(id,state) {
  const action=catalog.actions.find(a=>a.id===id);
  if(!action)throw new Error('unknown action');
  switch(action.kind){
    case 'score': return {[action.key]:Math.max(0,score(state[action.key])+action.delta)};
    case 'goal': {
      const home=action.side==='home';
      const sh=score(state.scoreHome)+(home?1:0),sa=score(state.scoreAway)+(home?0:1);
      return {scoreHome:sh,scoreAway:sa,goal_scoreHome:sh,goal_scoreAway:sa,
        goal_team:state[home?'teamHome':'teamAway'] || (home?'主队':'客队'),
        goal_color:state[home?'colorHome':'colorAway'] || '#FFD400',
        goal_name:state.goal_name || '进球',goal_num:state.goal_num || '',
        goal_trigger:'goal',goal_tick:0,score_trigger:'flash',score_tick:0};
    }
    case 'clock': {
      const key=action.prefix==='clock'?'clock_cmd':'sb_clockcmd';
      const tick=action.prefix==='clock'?'clock_tick':'sb_clock_tick';
      const c=state[action.prefix+'_state'];
      const cmd=action.command==='toggle'?(c.running?'pause':'start'):action.command;
      return {...(action.prefix==='clock'?{clock_show:true}:{}),[key]:cmd,[tick]:0};
    }
    case 'visibility': return {[action.key]:action.value==='toggle'?!truthy(state[action.key] ?? (action.key==='scoreboard_show')):action.value};
    case 'lineup': return {...(action.prefix==='all'?{lineup_mode:'all'}:{lineup_mode:'single',lineup_active:action.prefix}),lineup_show:true,lineup_tick:0};
    case 'patch': return {...action.patch};
    default: throw new Error('unknown action type');
  }
}
function controls(state){return {status:state.status||'running',restart_type:state.restart_type||'',card_type:state.card_type||'',scoreboard_show:truthy(state.scoreboard_show??true),clock_show:truthy(state.clock_show),lineup_show:truthy(state.lineup_show),logo_show:truthy(state.logo_show),lineup:state.lineup_mode==='single'?(state.lineup_active||'xiH'):'all',sb_clockrun:!!state.sb_clock_state.running,clock_run:!!state.clock_state.running};}
function status(state,now=Date.now()) {
  const visible={scoreboard:truthy(state.scoreboard_show ?? true),clock:truthy(state.clock_show),lineup:truthy(state.lineup_show),logo:truthy(state.logo_show)};
  const status={ok:true,onfield:{home:onfield(state,'home'),away:onfield(state,'away')},score:{home:score(state.scoreHome),away:score(state.scoreAway)},
    visible,lineup:state.lineup_mode==='single'?(state.lineup_active || 'xiH'):'all',buttons:{},controls:controls(state)};
  for(const prefix of ['sb_clock','clock']) {
    const c=state[prefix+'_state'];
    status[prefix]={running:c.running,mode:c.mode,milliseconds:Math.round(value(c,now))};
  }
  for(const a of catalog.actions){
    let active=true;
    if(a.kind==='visibility') {
      const on=visible[a.key.replace('_show','')];active=a.value===false?!on:on;
    } else if(a.kind==='clock') {
      const on=status[a.prefix].running;
      active=a.command==='pause'?!on:on;
    } else if(a.kind==='lineup')active=visible.lineup && status.lineup===a.prefix;
    else if(a.id==='hide_all')active=!Object.values(visible).some(Boolean);
    status.buttons[a.id]={active:active?'on':'off'};
  }
  return status;
}
module.exports={catalog,patchFor,status};
