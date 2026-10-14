'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {portableReleaseState}=require('../desktop/portable-data');

const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const name='足球转播控制台-1.0.0-Windows-x64';
const output=path.resolve(dist,process.argv[2]||name);
if(path.dirname(output)!==dist)throw Error('Target must be a direct child of dist');
if(!fs.existsSync(path.join(output,'足球转播控制台.exe')))throw Error('Portable application not found');
const inside=(parent,child)=>child.startsWith(parent+path.sep);
const remove=(target)=>{if(!inside(output,target))throw Error('Refusing to remove a path outside the portable folder');fs.rmSync(target,{recursive:true,force:true});};
const preferredState=path.join(root,'control','state.json');
const sourceExample=path.join(root,'control','state.example.json');
const sourceState=JSON.parse(fs.readFileSync(fs.existsSync(preferredState)?preferredState:sourceExample,'utf8').replace(/^\uFEFF/,''));
const clean=portableReleaseState(sourceState);
const snapshot=JSON.stringify(clean,null,2)+'\n';
const app=path.join(output,'resources','app');
fs.copyFileSync(path.join(root,'control','panel.html'),path.join(app,'control','panel.html'));
const theme=path.join(app,'control','glass-theme.css');
fs.writeFileSync(theme,fs.readFileSync(theme,'utf8').replace('linear-gradient(#ffffff66,#ffffff66),url("assets/console-background.jpg") center/cover fixed','linear-gradient(145deg,#edf1f6,#dfe5ec)'),'utf8');
const background=path.join(app,'control','assets','console-background.jpg');if(fs.existsSync(background))remove(background);
for(const file of ['main.js','portable-data.js'])fs.copyFileSync(path.join(root,'desktop',file),path.join(app,'desktop',file));
fs.writeFileSync(path.join(app,'desktop','seed-state.json'),snapshot,'utf8');

const data=path.join(output,'data');
fs.mkdirSync(data,{recursive:true});
for(const entry of fs.readdirSync(data))if(entry!=='state.json')remove(path.join(data,entry));
fs.writeFileSync(path.join(data,'state.json'),snapshot,'utf8');

const instructions=[
  '足球转播控制台 1.0.0 · Windows 10/11 64 位便携版','',
  '1. 将 ZIP 完整解压到普通文件夹（桌面、文档或 U 盘均可）。',
  '2. 双击「足球转播控制台.exe」。不需要安装 Node、Python、PowerShell、浏览器或 MicroKit。',
  '3. 打开「设备连接」，复制联合上屏地址并添加到本机 vMix 的网页浏览器输入。','',
  '便携包不包含球队、比分、名单、队徽、角标、赛事预设、浏览器数据或自定义背景；仅保留自定义字体。首次运行后录入的数据保存在当前文件夹 data 内。',
  '默认端口 8123。端口被占用时软件会自动换用可用端口，请以控制台复制的地址为准。',
  '播出期间保持软件运行。最小化不会停止控制服务；关闭主窗口即退出。vMix 和 Ulanzi Studio 是单独安装的软件。',
  '常用功能：比分和计时、进球、红黄牌、发球、球员条、换人、名单、预览安全框与排版工具。',
  '备份或换电脑时，先退出软件，再复制整个应用文件夹。升级时保留原 data 文件夹。',
  '第三方组件许可见 LICENSES 文件夹。',''
].join('\r\n');
fs.writeFileSync(path.join(output,'先读我-使用说明.txt'),'\uFEFF'+instructions,'utf8');

const manifestPath=path.join(output,'release-manifest.json');
let previous={};if(fs.existsSync(manifestPath))previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const files=[];
for(const entry of fs.readdirSync(output,{recursive:true,withFileTypes:true})){
  if(!entry.isFile())continue;
  const file=path.join(entry.parentPath,entry.name);
  if(file===manifestPath)continue;
  files.push({path:path.relative(output,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))});
}
fs.writeFileSync(manifestPath,JSON.stringify({version:'1.0.0',electron:previous.electron||'44.7.0',builtAt:new Date().toISOString(),platform:'win32-x64',runtimeSHA256:previous.runtimeSHA256||null,files},null,2),'utf8');
console.log('Sanitized portable release:',output);
console.log('Retained state keys:',Object.keys(clean).join(', ')||'(none)');
console.log('Files in manifest:',files.length);
