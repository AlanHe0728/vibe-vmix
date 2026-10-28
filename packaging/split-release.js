'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const version=require('../desktop/package.json').version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Version must be major.minor.patch');
const name='足球转播控制台-'+version+'-Windows-x64';
const archive=path.resolve(dist,(process.argv[2]||name)+'.zip');
const output=path.resolve(dist,process.argv[3]||'release-v'+version+'-assets');
if(path.dirname(archive)!==dist||path.dirname(output)!==dist)throw Error('Inputs and outputs must be direct children of dist');
if(!fs.existsSync(archive))throw Error('Sanitized release ZIP not found');
if(fs.existsSync(output))throw Error('Release asset directory already exists; refusing to overwrite it');
fs.mkdirSync(output,{recursive:false});
const limit=90_000_000,buffer=Buffer.allocUnsafe(8*1024*1024),input=fs.openSync(archive,'r');
let offset=0,index=1;
try{
  while(offset<fs.statSync(archive).size){
    const part=path.join(output,path.basename(archive)+'.'+String(index).padStart(3,'0'));
    const out=fs.openSync(part,'wx');let written=0;
    try{
      while(written<limit&&offset<fs.statSync(archive).size){
        const count=fs.readSync(input,buffer,0,Math.min(buffer.length,limit-written),offset);
        if(!count)break;
        fs.writeSync(out,buffer,0,count);offset+=count;written+=count;
      }
    }finally{fs.closeSync(out);}
    console.log(path.basename(part)+': '+written+' bytes');index++;
  }
}finally{fs.closeSync(input);}
const merge=fs.readFileSync(path.join(__dirname,'merge-v1.0.0-release.bat'),'utf8')
  .replace(/^@echo off\r?\n/,'@echo off\nchcp 65001 >nul\n')
  .replaceAll('足球转播控制台-1.0.0-Windows-x64.zip',path.basename(archive));
if(index-1!==2)throw Error('The merge script expects exactly two parts; update the script before publishing');
fs.writeFileSync(path.join(output,'合并便携版.bat'),merge.replace(/\r?\n/g,'\r\n'),'utf8');
fs.copyFileSync(archive+'.sha256',path.join(output,path.basename(archive)+'.sha256'));
console.log('Release assets prepared:',output);
