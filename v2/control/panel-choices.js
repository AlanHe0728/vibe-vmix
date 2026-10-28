/* Selected controls reflect acknowledged match state; hover never writes data. */
(function(){
  'use strict';
  var values={};
  function init(){
    document.querySelectorAll('.btn[onclick]').forEach(function(b){
      var code=b.getAttribute('onclick'),m,key,value;
      if(b.dataset.matchStatus){key='status';value=b.dataset.matchStatus;}
      else if((m=code.match(/setVis\('([^']+)',(true|false)\)/))){key=m[1];value=m[2];}
      else if((m=code.match(/(?:restart|card)\('([^']+)'\)/))){key=code.startsWith('restart')?'restart_type':'card_type';value=m[1];}
      else if((m=code.match(/clockCmd\('(start|pause)'\)/))){key='clock_run';value=String(m[1]==='start');}
      else if((m=code.match(/trigger\('sb_clockcmd','(start|pause)'\)/))){key='sb_clockrun';value=String(m[1]==='start');}
      else if((m=code.match(/lineupWrite\('([^']+)'\)/))){key='lineup';value=m[1];}
      else if(/lineupAllShow\(|lineupAllWrite\(true\)/.test(code)){key='lineup';value='all';}
      if(key){b.classList.add('choice-button');b.dataset.choice=key;b.dataset.choiceValue=value;b.setAttribute('aria-pressed','false');}
    });
    document.addEventListener('change',syncSelects);document.addEventListener('input',syncSelects);syncSelects();
  }
  function syncSelects(){document.querySelectorAll('select[id$="_roster_player"],#sub_off_player,#sub_on_player').forEach(function(s){s.classList.add('roster-select');s.classList.toggle('has-value',!!s.value);});}
  function render(controls){
    Object.assign(values,controls||{});
    if(window.FBPMatchTiming)FBPMatchTiming.observe(controls);
    if(window.FBPDesk)FBPDesk.observe(controls);
    if(window.FBPEvents)FBPEvents.observe(controls);
    document.querySelectorAll('.choice-button').forEach(function(b){var selected=String(values[b.dataset.choice])===b.dataset.choiceValue;if(b.dataset.choice==='lineup')selected=selected&&!!values.lineup_show;b.setAttribute('aria-pressed',String(selected));});syncSelects();
  }
  function fromState(s){render({period:s.period||'上半场',match_timing:s.match_timing,match_break_until:s.match_break_until,match_clock:s.sb_clock_state,status:s.status||'running',restart_type:s.restart_type||'',card_type:s.card_type||'',scoreboard_show:s.scoreboard_show===undefined?true:truthy(s.scoreboard_show),clock_show:truthy(s.clock_show),lineup_show:truthy(s.lineup_show),logo_show:truthy(s.logo_show),lineup:s.lineup_mode==='single'?(s.lineup_active||'xiH'):'all',sb_clockrun:!!(s.sb_clock_state&&s.sb_clock_state.running),clock_run:!!(s.clock_state&&s.clock_state.running)});}
  function truthy(v){return v===true||v===1||v==='1'||v==='true';}
  window.FBPChoices={init:init,render:render,fromState:fromState,syncSelects:syncSelects};
})();
