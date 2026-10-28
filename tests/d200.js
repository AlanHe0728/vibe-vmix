const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {startServer,stop,delay}=require('./regression');
const {catalog,patchFor,status}=require('../control/d200');
const {migrate}=require('../control/clock-state');
async function suite(kind,temp){
  const file=path.join(temp,kind+'.json');
  fs.writeFileSync(file,JSON.stringify({teamHome:'主队甲',teamAway:'客队乙',colorHome:'#123456',colorAway:'#654321',
    scoreHome:0,scoreAway:0,goal_name:'张三',goal_num:'9',card_name:'李四',card_num:'8',
    xiH_players:'1 甲\n2 乙',logo_data:'preserve',clock_mode:'down',clock_mm:3}));
  const server=await startServer(kind,file),base=server.base;
  const read=async()=>await (await fetch(base+'/state.json')).json();
  const act=async id=>{const r=await fetch(base+'/api/d200/action/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(r.status,200,await r.clone().text());const s=await r.json();assert.equal(s.ok,true);assert.equal(s.action,id);return s;};
  try{
    assert.equal((await fetch(base+'/control/d200.html')).status,200);
    assert.equal(new Set(catalog.actions.map(a=>a.id)).size,catalog.actions.length);
    const c=await (await fetch(base+'/api/d200/actions')).json();assert.deepEqual(c.actions,catalog.actions);assert.equal(c.recommended.length,12);
    const original=fs.readFileSync(file,'utf8'),etag=(await fetch(base+'/state.json')).headers.get('etag');
    for(let i=0;i<3;i++)assert.equal((await fetch(base+'/api/d200/status')).status,200);
    assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal((await fetch(base+'/state.json',{headers:{'If-None-Match':etag}})).status,304);
    assert.equal((await fetch(base+'/api/d200/action/home_goal')).status,405);
    assert.equal((await fetch(base+'/api/d200/action/not_a_button',{method:'POST'})).status,404);
    assert.equal((await read()).scoreHome,0);
    await act('home_score_minus');assert.equal((await read()).scoreHome,0);
    await Promise.all(Array.from({length:8},()=>act('home_goal')));
    let s=await read();assert.equal(s.scoreHome,8);assert.equal(s.goal_scoreHome,8);assert.equal(s.goal_team,'主队甲');assert.equal(s.goal_name,'张三');assert.equal(s.goal_num,'9');
    const tick=s.goal_tick;await act('home_goal');s=await read();assert.equal(s.scoreHome,9);assert(s.goal_tick>tick);
    await act('away_goal');s=await read();assert.equal(s.scoreAway,1);assert.equal(s.goal_team,'客队乙');assert.equal(s.goal_color,'#654321');
    await act('goal_replay');assert.equal((await read()).scoreAway,1);
    await Promise.all(Array.from({length:6},(_,i)=>i%2 ? act('home_goal') :
      fetch(base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scoreHome_delta:1})}).then(async r=>{assert.equal(r.status,200);assert.equal((await r.json()).ok,true);})));
    s=await read();assert.equal(s.scoreHome,15);assert.equal(s.scoreHome_delta,undefined);
    let r=await act('scoreboard_toggle');assert.equal(r.status.visible.scoreboard,false);assert.equal(r.status.buttons.scoreboard_toggle.active,'off');
    r=await act('scoreboard_toggle');assert.equal(r.status.visible.scoreboard,true);
    r=await act('sb_clock_toggle');assert.equal(r.status.sb_clock.running,true);
    await delay(150);r=await act('sb_clock_toggle');assert.equal(r.status.sb_clock.running,false);assert(r.status.sb_clock.milliseconds>=100);
    r=await act('clock_run_toggle');assert.equal(r.status.clock.running,true);assert.equal(r.status.visible.clock,true);
    await delay(150);r=await act('clock_run_toggle');assert.equal(r.status.clock.running,false);assert(r.status.clock.milliseconds<180000);
    r=await act('lineup_all');assert.equal(r.status.lineup,'all');assert.equal(r.status.buttons.lineup_all.active,'on');
    for(const p of ['xiH','xiA','subH','subA']){r=await act('lineup_'+p);assert.equal(r.status.lineup,p);assert.equal(r.status.buttons['lineup_'+p].active,'on');}
    r=await act('card_yellow');s=await read();assert.equal(s.card_name,'李四');assert.equal(s.card_trigger,'yellow');
    const cardTick=s.card_tick;await act('card_yellow');assert((await read()).card_tick>cardTick);
    await act('card_red');assert.equal((await read()).card_trigger,'red');
    const stateBefore=await read();r=await act('hide_all');assert.deepEqual(r.status.visible,{scoreboard:false,clock:false,lineup:false,logo:false});
    s=await read();assert(s.clear_events_tick>0);assert.deepEqual(s.clock_state,stateBefore.clock_state);
    // Execute every catalog action and compare the two server implementations with pure JS semantics.
    await fetch(base+'/state.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subH_players:'3 替补',sub_side:'home',sub_off_id:'home|1|甲',sub_on_id:'home|3|替补'})});
    for(const a of catalog.actions){
      const before=await read(),patch=patchFor(a.id,before);await act(a.id);const after=await read();
      for(const [key,v] of Object.entries(patch)){
        if(key.endsWith('_tick'))assert(after[key]>(before[key]||0));
        else if(['clock_cmd','sb_clockcmd'].includes(key))assert.equal(after[key],v);
        else assert.deepEqual(after[key],v,a.id+' '+key);
      }
      const got=await (await fetch(base+'/api/d200/status')).json(),expected=status(migrate(after));
      assert.deepEqual(got.buttons,expected.buttons,a.id+' status');assert.deepEqual(got.visible,expected.visible);
      assert.equal(after.logo_data,'preserve');assert.equal(after.xiH_players,'1 甲\n2 乙');
    }
    // A failed button commit must preserve score, event tick and all current state.
    const before=fs.readFileSync(file,'utf8');fs.renameSync(file,file+'.saved');fs.mkdirSync(file);
    const failure=await fetch(base+'/api/d200/action/home_goal',{method:'POST'});assert.equal(failure.status,500);assert.equal((await failure.json()).ok,false);
    const unchanged=await read();assert.equal(unchanged.scoreHome,JSON.parse(before).scoreHome);assert.equal(unchanged.goal_tick,JSON.parse(before).goal_tick);
    fs.rmdirSync(file);fs.renameSync(file+'.saved',file);
    console.log('PASS '+kind+' 44 D200 actions, 12 recommendations, POST-only events, read-only polling, concurrent goals, status parity, save-failure rollback');
  }finally{await stop(server.child);}
}
async function main(){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fbp-d200-'));
  try{await suite('node',temp);if(process.platform==='win32')await suite('powershell',temp);}
  finally{if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup path');fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
