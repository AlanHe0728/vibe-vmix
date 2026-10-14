'use strict';
const {app,BrowserWindow,Menu,dialog,shell,clipboard,session,powerSaveBlocker} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {createServer} = require('../control/serve');
const {prepareData,listenPortable} = require('./portable-data');

const appRoot = path.resolve(__dirname,'..');
const dataDirectory = process.env.FBP_PORTABLE_DATA
  ? path.resolve(process.env.FBP_PORTABLE_DATA) : path.join(path.dirname(process.execPath),'data');
const icon = path.join(__dirname,'icon.ico');
const testing = process.env.FBP_PORTABLE_TEST === '1';
let server,origin,mainWindow,closing = false,stopping = false,quitReady = false,blocker;
const children = new Set();
app.setName('足球转播控制台');

function logError(error) {
  try { fs.appendFileSync(path.join(dataDirectory,'desktop-error.log'),new Date().toISOString()+' '+(error.stack||error)+'\n','utf8'); } catch (_) {}
}
function fatal(error) {
  logError(error);
  dialog.showErrorBox('足球转播控制台启动失败',
    '请把整个软件文件夹解压到可写入的位置（例如桌面或文档），再双击 EXE。\n\n'+
    '已有比赛数据不会被覆盖。数据位置：\n'+dataDirectory+'\n\n'+error.message);
  app.quit();
}
function localURL(url) {
  try { return new URL(url).origin === origin; } catch (_) { return false; }
}
function externalURL(url) {
  // Only the explicitly offered documentation sites leave the application.
  try { const u=new URL(url); return u.protocol==='https:' &&
    ['bbs.ulanzistudio.com','www.vmix.com'].includes(u.hostname); } catch (_) { return false; }
}
function preferences() {
  return {nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
    backgroundThrottling:false,spellcheck:false};
}
function guard(window) {
  window.webContents.setWindowOpenHandler(({url})=>{
    if (localURL(url)) openChild(url);
    else if (externalURL(url)) shell.openExternal(url).catch(logError);
    return {action:'deny'};
  });
  const navigate = (event,url) => {
    const destination = url || event.url;
    if (!localURL(destination)) {
      event.preventDefault();
      if (externalURL(destination)) shell.openExternal(destination).catch(logError);
    }
  };
  window.webContents.on('will-navigate',navigate);
  window.webContents.on('will-redirect',navigate);
  window.webContents.on('render-process-gone',(_,details)=>{
    if (details.reason==='clean-exit' || closing) return;
    logError(new Error('Renderer exited: '+details.reason));
    dialog.showMessageBox(window,{type:'error',title:'窗口需要重新加载',
      message:'比赛数据已保存在软件目录。',detail:'点击重新加载恢复控制窗口。',
      buttons:['重新加载','关闭窗口'],defaultId:0}).then(({response})=>{
        if (window.isDestroyed()) return;
        response===0 ? window.reload() : window.close();
      });
  });
}
function openChild(url) {
  if (closing || !localURL(url)) return;
  const existing = Array.from(children).find(w=>!w.isDestroyed() && w.webContents.getURL()===url);
  if (existing) { if (existing.isMinimized()) existing.restore(); existing.focus(); return; }
  const child = new BrowserWindow({width:1440,height:900,minWidth:860,minHeight:600,
    show:false,icon,backgroundColor:'#e7e5e2',webPreferences:preferences()});
  children.add(child); child.setMenu(null); guard(child);
  child.once('ready-to-show',()=>{if(!testing)child.show();});
  child.on('closed',()=>children.delete(child));
  child.loadURL(url).catch(logError);
}
function createMain() {
  mainWindow = new BrowserWindow({width:1440,height:960,minWidth:860,minHeight:650,
    show:false,icon,backgroundColor:'#e7e5e2',title:'足球转播控制台',webPreferences:preferences()});
  mainWindow.on('page-title-updated',event=>event.preventDefault());
  mainWindow.setTitle('足球转播控制台 · 本地端口 '+new URL(origin).port);
  guard(mainWindow);
  mainWindow.once('ready-to-show',()=>{if(!testing)mainWindow.show();});
  mainWindow.on('close',event=>{
    if (!quitReady) {
      event.preventDefault();
      // Start quitting after this close event has unwound. A reentrant quit
      // inside the event can leave the native window's close flag set.
      if (!closing) setImmediate(()=>app.quit());
    }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'比赛',submenu:[
      {label:'预览与布局',accelerator:'CmdOrCtrl+Shift+P',click:()=>openChild(origin+'/control/preview.html')},
      {label:'复制 vMix 上屏地址',click:()=>clipboard.writeText(origin+'/titles/graphics.html')},
      {label:'D200 按键配置',click:()=>openChild(origin+'/control/d200.html')},
      {type:'separator'},
      {label:'打开数据文件夹',click:()=>shell.openPath(dataDirectory).then(error=>{if(error)logError(new Error(error));})},
      {label:'退出软件',role:'quit'}]},
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},
      {role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'窗口',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},
      {type:'separator'},{role:'minimize'},{role:'togglefullscreen'}]}
  ]));
  mainWindow.loadURL(origin+'/control/panel.html').catch(fatal);
}

app.on('before-quit',event=>{
  if (quitReady || !server) return;
  event.preventDefault();
  if (stopping) return;
  stopping=true; closing=true;
  try { server.pauseClocks(); } catch (error) { logError(error); }
  let completed = false;
  const finish = () => {
    if (completed) return; completed=true; quitReady=true;
    if (blocker!==undefined) powerSaveBlocker.stop(blocker);
    app.quit();
  };
  server.close(finish);
  // Polling keep-alive connections must not leave the app lingering on exit.
  server.closeIdleConnections();
  setTimeout(()=>{server.closeAllConnections();finish();},1500).unref();
});
app.on('window-all-closed',()=>app.quit());

function start() {
try {
  fs.mkdirSync(dataDirectory,{recursive:true});
  const profile = path.join(dataDirectory,'browser'); fs.mkdirSync(profile,{recursive:true});
  app.setPath('userData',profile); app.setPath('sessionData',profile);
} catch (error) { fatal(error); return; }

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance',()=>{
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!testing) {
        if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus();
      }
    }
  });
  app.whenReady().then(async()=>{
    const stateFile=prepareData(dataDirectory,path.join(__dirname,'seed-state.json'));
    server=createServer({root:appRoot,stateFile,staticDirectories:['control','titles']});
    origin=await listenPortable(server,Number(process.env.FBP_PORTABLE_PORT || 8123));
    // Saved browser choices and server match data both travel with the folder.
    session.defaultSession.setPermissionRequestHandler((webContents,permission,callback,details)=>{
      callback(localURL(details.requestingUrl||webContents.getURL()) &&
        ['clipboard-read','clipboard-sanitized-write'].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents,permission,requestingOrigin)=>
      localURL(requestingOrigin||webContents?.getURL()) &&
      ['clipboard-read','clipboard-sanitized-write'].includes(permission));
    blocker=powerSaveBlocker.start('prevent-app-suspension');
    createMain();
  }).catch(fatal);
}
}
start();
