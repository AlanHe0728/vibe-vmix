// Clock anchors are changed only by commands, never by rendering pages.
const {applyRoster,migrateRoster}=require('./match-roster');
const POSITIONS = { sb:[423,96], clk:[960,400], rst:[960,918], card:[960,500],
  ply:[390,918], goal:[960,500], sub:[960,500], logo:[1760,96], lineup:[960,540], lineup_all:[960,580] };
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const nonnegative = v => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
function value(c, now) {
  const elapsed = c.running ? Math.max(0, now - c.base) : 0;
  return Math.max(0, c.accMs + (c.mode === 'down' ? -elapsed : elapsed));
}
function migrate(s, now = Date.now()) {
  s = { ...s };
  for (const prefix of ['sb_clock','clock']) {
    const key = prefix + '_state';
    if (s[key] && typeof s[key] === 'object' && Number.isFinite(s[key].accMs) && Number.isFinite(s[key].base)) continue;
    s[key] = { mode:s[prefix + (prefix === 'clock' ? '_mode' : 'mode')] === 'down' ? 'down' : 'up',
      running:Number(s[prefix + (prefix === 'clock' ? '_run' : 'run')]) === 1,
      accMs:prefix === 'clock' ? (nonnegative(s.clock_mm ?? 15)*60 + nonnegative(s.clock_ss))*1000 : nonnegative(s.sb_clockacc),
      base:now };
  }
  return migrateRoster(s);
}
function command(s, patch, prefix, now) {
  const key = prefix + '_state', cmdKey = prefix === 'clock' ? 'clock_cmd' : 'sb_clockcmd';
  if (!own(patch,cmdKey)) return;
  const c = { ...s[key] }, cmd = patch[cmdKey];
  let ms = value(c,now);
  if (cmd === 'set') {
    c.mode = s[prefix === 'clock' ? 'clock_mode' : 'sb_clockmode'] === 'down' ? 'down' : 'up';
    ms = prefix === 'clock' ? (nonnegative(s.clock_mm)*60 + nonnegative(s.clock_ss))*1000 : nonnegative(s.sb_clockacc);
    c.running = false;
  } else if (cmd === 'start') c.running = true;
  else if (cmd === 'pause') c.running = false;
  else if (cmd === 'reset') { ms = 0; c.running = false; }
  else if (cmd === 'plus') ms += 60000;
  else if (cmd === 'minus') ms = Math.max(0,ms-60000);
  else if (cmd === 'up' || cmd === 'down') { c.mode = cmd; ms = 0; c.running = false; }
  else throw new Error('invalid clock command');
  c.accMs = ms; c.base = now; s[key] = c;
  if (prefix === 'clock') {
    s.clock_mode = c.mode; s.clock_run = c.running ? 1 : 0;
    s.clock_mm = Math.floor(ms/60000); s.clock_ss = Math.floor(ms/1000)%60;
  } else { s.sb_clockmode = c.mode; s.sb_clockrun = c.running ? 1 : 0; s.sb_clockacc = ms; }
}
function merge(current, patch, now = Date.now()) {
  const s = migrate(current,now);
  for (const [key,v] of Object.entries(patch)) {
    if (['__proto__','constructor','prototype','clock_state','sb_clock_state','scoreHome_delta','scoreAway_delta'].includes(key)) continue;
    // Unique events even across multiple control panels.
    s[key] = key.endsWith('_tick') ? Math.max(now,nonnegative(s[key])+1) : v;
  }
  for (const k of ['scoreHome','scoreAway','goal_scoreHome','goal_scoreAway']) {
    if (own(patch,k)) s[k] = Math.floor(nonnegative(patch[k]));
  }
  for(const k of ['scoreHome','scoreAway']){
    if(own(patch,k+'_delta')){
      const delta=Number(patch[k+'_delta']);
      if(!Number.isSafeInteger(delta))throw new Error('invalid score delta');
      s[k]=Math.max(0,Math.floor(nonnegative(current[k]))+delta);
    }
  }
  if(['scoreHome','scoreAway','scoreHome_delta','scoreAway_delta'].some(k=>own(patch,k))){
    s.goal_scoreHome=Math.floor(nonnegative(s.scoreHome));s.goal_scoreAway=Math.floor(nonnegative(s.scoreAway));
  }
  applyRoster(current,s,patch);
  command(s,patch,'sb_clock',now); command(s,patch,'clock',now);
  if (own(patch,'posreset_tick')) for (const [k,[x,y]] of Object.entries(POSITIONS)) {
    s[k+'_pos'] = {x,y}; s[k+'_scale'] = 1;
  }
  return s;
}
module.exports = {migrate,merge,value};
