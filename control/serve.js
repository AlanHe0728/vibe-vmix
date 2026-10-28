const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const clocks = require('./clock-state');
const d200 = require('./d200');
const timing = require('./match-timing');
// Both the legacy CLI and the portable desktop app use this exact server.
// Importing the module must not open a port or a browser.
function createServer(options = {}) {
const ROOT = path.resolve(options.root || path.dirname(__dirname));
const STATE_FILE = path.resolve(options.stateFile || process.env.FBP_STATE_FILE || path.join(__dirname,'state.json'));
let state = {};
if (fs.existsSync(STATE_FILE)) {
  // Do not silently replace unreadable or corrupt user data with an empty state.
  state = JSON.parse(fs.readFileSync(STATE_FILE,'utf8').replace(/^\uFEFF/,''));
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid state file');
}
state = clocks.migrate(state);
let cachedBody, cachedETag;
function cacheState() {
  cachedBody = Buffer.from(JSON.stringify(state),'utf8');
  cachedETag = '"'+crypto.createHash('sha256').update(cachedBody).digest('hex')+'"';
}
cacheState();
function commit(next) {
  const temp = STATE_FILE+'.tmp';
  try {
    fs.writeFileSync(temp,JSON.stringify(next,null,2),'utf8');
    fs.renameSync(temp,STATE_FILE);
  } catch (e) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw e;
  }
  state = next; cacheState();
}
let autoSaveFailed=false;
function advanceMatch(){
  try{const next=timing.advance(state);if(next)commit(next);autoSaveFailed=false;}
  catch(error){if(!autoSaveFailed)console.error('Automatic match timing save failed:',error.message);autoSaveFailed=true;}
}
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers','ETag');
}
function json(res,obj,code=200) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(obj));
}
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
  '.webp':'image/webp','.ico':'image/x-icon','.md':'text/plain; charset=utf-8' };
const server = http.createServer((req,res) => {
  cors(res);
  let p;
  try { p = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch (_) { return json(res,{ok:false,error:'invalid URL'},400); }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if(p==='/state.json'||p==='/state'||p.startsWith('/api/d200/'))advanceMatch();
  if(p.startsWith('/api/d200/')){
    res.setHeader('Cache-Control','no-store');
    if(p==='/api/d200/actions' || p==='/api/d200/status'){
      if(req.method!=='GET')return json(res,{ok:false,error:'use GET for status or actions'},405);
      return json(res,p.endsWith('/status')?d200.status(state):{ok:true,...d200.catalog});
    }
    const match=p.match(/^\/api\/d200\/action\/([A-Za-z0-9_]+)$/);
    if(!match || !d200.catalog.actions.some(a=>a.id===match[1]))return json(res,{ok:false,error:'unknown D200 action'},404);
    if(req.method!=='POST')return json(res,{ok:false,error:'按键动作使用 POST，状态轮询使用 GET /api/d200/status'},405);
    // Discard body; the action reads the latest server state atomically.
    req.resume();
    let next;
    try {next=clocks.merge(state,d200.patchFor(match[1],state));}
    catch(e){return json(res,{ok:false,error:e.message},400);}
    try {commit(next);}
    catch(e){return json(res,{ok:false,error:'保存失败，请检查文件权限和磁盘空间'},500);}
    return json(res,{ok:true,action:match[1],status:d200.status(state)});
  }
  if (/^\/state(\.json)?\/?$/.test(p)) {
    if (req.method === 'GET') {
      res.setHeader('ETag',cachedETag); res.setHeader('Cache-Control','no-cache');
      if (req.headers['if-none-match'] === cachedETag) { res.writeHead(304); return res.end(); }
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}); return res.end(cachedBody);
    }
    if (req.method === 'POST') {
      let body = '', size = 0, tooLarge = false;
      req.setEncoding('utf8');
      req.on('data',chunk => {
        size += Buffer.byteLength(chunk,'utf8');
        if (size > 32*1024*1024) { tooLarge = true; body = ''; } else if (!tooLarge) body += chunk;
      });
      req.on('end',() => {
        if (tooLarge) return json(res,{ok:false,error:'upload exceeds 32 MB'},413);
        let patch;
        try { patch = JSON.parse(body); } catch (_) { return json(res,{ok:false,error:'invalid JSON'},400); }
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json(res,{ok:false,error:'expected object'},400);
        let next;
        try { next = clocks.merge(state,patch); } catch (e) { return json(res,{ok:false,error:e.message},400); }
        try { commit(next); } catch (e) {
          console.error('State save failed:',e.message);
          return json(res,{ok:false,error:'保存失败，请检查文件权限和磁盘空间'},500);
        }
        const status=d200.status(state);
        return json(res,{ok:true,score:status.score,onfield:status.onfield,controls:status.controls});
      });
      return;
    }
    return json(res,{ok:false,error:'method not allowed'},405);
  }
  if (p === '/') { res.writeHead(302,{Location:'/control/panel.html'}); return res.end(); }
  const file = path.resolve(ROOT,'.'+p.replace(/\\/g,'/'));
  if (!file.startsWith(ROOT+path.sep)) return json(res,{ok:false,error:'not found'},404);
  if (options.staticDirectories && !options.staticDirectories.includes(path.relative(ROOT,file).split(path.sep)[0])) {
    return json(res,{ok:false,error:'not found'},404);
  }
  fs.stat(file,(error,stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end('404 Not Found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-cache'});
    fs.createReadStream(file).on('error',() => res.destroy()).pipe(res);
  });
});
server.pauseClocks = () => {
  const patch = {};
  if(state.match_break_until>0)patch.match_timing_suspend=true;
  if (state.sb_clock_state.running) patch.sb_clockcmd = 'pause';
  if (state.clock_state.running) patch.clock_cmd = 'pause';
  if (Object.keys(patch).length) commit(clocks.merge(state,patch));
};
let autoTimer;
server.on('listening',()=>{autoTimer=setInterval(advanceMatch,200);autoTimer.unref();});
server.on('close',()=>clearInterval(autoTimer));
return server;
}
module.exports = {createServer};

if (require.main === module) {
const PORT = Number(process.env.PORT || 8123);
const server = createServer();
server.on('error',e => {
  console.error(e.code === 'EADDRINUSE' ? '端口 '+PORT+' 已被占用，请关闭原服务器或设置 PORT=8124。' : e.message);
  process.exit(1);
});
server.listen(PORT,() => {
  const url = 'http://localhost:'+server.address().port+'/control/panel.html';
  console.log('足球包装服务器已启动: '+url);
  if (process.env.FBP_NO_BROWSER === '1') return;
  const {spawn} = require('child_process');
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c','start','',url] : [url];
  spawn(cmd,args,{stdio:'ignore',windowsHide:true}).on('error',() => console.log('请手动打开: '+url));
});
}
