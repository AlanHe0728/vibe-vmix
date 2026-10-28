'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {portableReleaseState}=require('../desktop/portable-data');
const {makeIcon}=require('./make-icon');
const root=path.resolve(__dirname,'..'),version='44.7.0';
const appVersion=require('../desktop/package.json').version;
if(!/^\d+\.\d+\.\d+$/.test(appVersion))throw Error('Desktop version must be major.minor.patch');
const name='足球转播控制台-'+appVersion+'-Windows-x64';
const output=path.join(root,'dist',process.argv[2]||name);
if(path.dirname(output)!==path.join(root,'dist'))throw Error('Output must be a direct child of dist');
if(fs.existsSync(output)||fs.existsSync(output+'.zip'))throw Error('Release already exists; choose a new output name. Existing portable match data must never be overwritten.');
const cache=path.join(__dirname,'cache'),asset='electron-v'+version+'-win32-x64.zip';
const runtime=path.join(cache,asset);
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const expected=fs.readFileSync(path.join(cache,'SHASUMS256.txt'),'utf8').split(/\r?\n/).find(line=>line.endsWith(asset))?.split(/\s+/)[0];
if(!expected||sha(fs.readFileSync(runtime))!==expected.toLowerCase())throw Error('Official Electron SHA256 verification failed');
const run=(command,args)=>{
  const result=spawnSync(command,args,{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(command+' failed: '+result.status);
};
fs.mkdirSync(path.dirname(output),{recursive:true});
run(process.env.FBP_BUILD_PYTHON||'python',[path.join(__dirname,'archive.py'),'extract',runtime,output]);
const production=path.join(output,'resources','app');fs.mkdirSync(production,{recursive:true});
for(const directory of ['control','titles']) {
  for(const entry of fs.readdirSync(path.join(root,directory),{recursive:true,withFileTypes:true})) {
    if(!entry.isFile())continue;
    const source=path.join(entry.parentPath,entry.name),relative=path.relative(root,source);
    if(relative==='control'+path.sep+'assets'+path.sep+'console-background.jpg')continue;
    if(!/\.(html|js|css|svg|png|jpe?g|webp|ico|woff2?|ttf|otf)$/i.test(entry.name) && relative!=='control'+path.sep+'d200-actions.json')continue;
    const target=path.join(production,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(relative==='control'+path.sep+'glass-theme.css') {
      const css=fs.readFileSync(source,'utf8').replace('linear-gradient(#ffffff66,#ffffff66),url("assets/console-background.jpg") center/cover fixed','linear-gradient(145deg,#edf1f6,#dfe5ec)');
      fs.writeFileSync(target,css,'utf8');
    } else fs.copyFileSync(source,target);
  }
}
fs.mkdirSync(path.join(production,'desktop'),{recursive:true});
for(const file of ['main.js','portable-data.js'])fs.copyFileSync(path.join(root,'desktop',file),path.join(production,'desktop',file));
fs.copyFileSync(path.join(root,'desktop','package.json'),path.join(production,'package.json'));
fs.cpSync(path.join(__dirname,'licenses'),path.join(output,'LICENSES'),{recursive:true});
fs.copyFileSync(path.join(root,'docs','MICROKIT_LICENSE.txt'),path.join(output,'LICENSES','MicroKit-MIT.txt'));
makeIcon(path.join(production,'desktop','icon.ico'));
const preferredState=path.join(root,'control','state.json');
const exampleState=path.join(root,'control','state.example.json');
const snapshot=portableReleaseState(JSON.parse(fs.readFileSync(fs.existsSync(preferredState)?preferredState:exampleState,'utf8').replace(/^\uFEFF/,'')));
for(const key of ['font_data']) {
  const value=snapshot[key];
  if(value&& !String(value).startsWith('data:'))throw Error('Saved '+key+' uses a nonembedded asset; copy it into the release before packaging');
}
const seed=JSON.stringify(snapshot,null,2);
fs.writeFileSync(path.join(production,'desktop','seed-state.json'),seed,'utf8');
fs.mkdirSync(path.join(output,'data'),{recursive:true});fs.writeFileSync(path.join(output,'data','state.json'),seed,'utf8');
// Replace only the unused Electron welcome application in this new release.
const welcome=path.join(output,'resources','default_app.asar');if(fs.existsSync(welcome))fs.unlinkSync(welcome);
const executable=path.join(output,'足球转播控制台.exe');fs.renameSync(path.join(output,'electron.exe'),executable);
const rcedit=path.join(cache,'rcedit-x64.exe');
run(rcedit,[executable,'--set-icon',path.join(production,'desktop','icon.ico'),
  '--set-version-string','ProductName','足球转播控制台',
  '--set-version-string','FileDescription','足球转播控制台 · vMix 图形包装',
  '--set-version-string','OriginalFilename','足球转播控制台.exe',
  '--set-version-string','CompanyName','足球转播工具',
  '--set-file-version',appVersion+'.0','--set-product-version',appVersion+'.0']);
const instructions=[
  '足球转播控制台 '+appVersion+' · Windows 10/11 64 位便携版','',
  '1. 先把 ZIP 完整解压到普通文件夹（桌面、文档、U 盘均可）。',
  '2. 双击「足球转播控制台.exe」。不需要安装 Node、Python、PowerShell 或 MicroKit，也不用联网下载组件。',
  '3. 在「设备连接」复制联合上屏地址，粘贴到本机 vMix 的网页浏览器输入，画布设为 1920×1080。','',
  '比赛期间保持软件运行。最小化不会停止控制服务；关闭主窗口即退出，计时器自动暂停。',
  '顶部「比赛」菜单可打开预览与布局、D200 配置，也可直接复制 vMix 地址。',
  '默认端口 8123；被占用时自动换用空闲端口。以本次软件显示和复制的地址为准。',
  '可以单独运行控制台和预览；正式上屏仍需电脑已有 vMix，D200 功能仍由 Ulanzi Studio API Request 调用。','',
  '球队、名单、图片、字体、布局：data\\state.json。',
  '赛事预设、预览辅助线、界面设置：data\\browser。',
  '将整个软件文件夹复制到另一台电脑即可继续使用。备份或升级前，先关闭软件并备份整个 data 文件夹。',
  '只复制 EXE 会缺少内置运行文件；请始终复制整个文件夹。',
  '便携版不含队名、名单、队徽、角标、比赛预设或自定义背景；仅保留已保存的自定义字体。',
  '首次使用时请在控制台录入本场信息并上传所需队徽；这些数据只保存在当前软件文件夹。',
  '升级时将原 data 文件夹复制到新版软件中，不要用新包的数据覆盖已有比赛。',
  '',
  '常用操作：',
  '比赛控制：比分、队名、阶段、状态、比赛时钟和独立计时器。',
  '球员事件：进球、红黄牌、发球、球员条、换人；导入名单后支持选择球员和输入号码匹配。',
  '名单：粘贴号码姓名或导入 Excel，保存后可一次显示双方首发和替补，也可单独显示。',
  '名单页「比赛配置文件」可导出/读取 TXT，一份文件带走双方队名、颜色、内嵌队徽、首发、替补、位置与队长/GK 标记。',
  '名单行尾 (GK) 标记守门员，(C) 标记队长；两者可以同时标记。Excel 支持位置、队长和守门员列。',
  '顶部比分区的比赛时钟始终可开始/暂停；计时设置中可启用半场及中场休息的自动切换，默认关闭。',
  '名单页最下面的总名单可逐条勾选首发，首发和替补自动分配，选完点击「保存双方首发」。',
  '读取配置后场内名单恢复首发；下一场的比分和时间请在比赛控制中自行重置。',
  '画面设置：皮肤、颜色、动画、队徽、角标、背景和自定义字体，素材随数据保存。',
  '预览与布局：拖动缩放、精确坐标、安全框、比例、对齐、网格吸附和仅预览隐藏。','',
  '版权说明：内置 Electron/Chromium、Motion、SheetJS 的许可随软件保留。',
  '运行问题记录在 data\\desktop-error.log；数据格式损坏时软件会提示，不会清空已有数据。',''
].join('\r\n');
fs.writeFileSync(path.join(output,'先读我-使用说明.txt'),'\uFEFF'+instructions,'utf8');
const files=[];
for(const entry of fs.readdirSync(output,{recursive:true,withFileTypes:true})) {
  if(!entry.isFile())continue;
  const file=path.join(entry.parentPath,entry.name);files.push({path:path.relative(output,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))});
}
fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({version:appVersion,electron:version,
  builtAt:new Date().toISOString(),platform:'win32-x64',runtimeSHA256:expected,files},null,2));
console.log('Ready:',output);
if(!process.argv.includes('--no-zip')) {
  run(process.env.FBP_BUILD_PYTHON||'python',[path.join(__dirname,'archive.py'),'zip',output,output+'.zip']);
  const checksum=sha(fs.readFileSync(output+'.zip'));
  fs.writeFileSync(output+'.zip.sha256',checksum+'  '+path.basename(output)+'.zip\n','utf8');
  console.log('ZIP:',output+'.zip');console.log('SHA256:',checksum);
}
