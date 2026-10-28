/* Saved upload names describe server-confirmed resources, not local file paths. */
(function(){
  'use strict';
  var state={},entries={
    homeLogo:{input:'homeLogoFile',label:'主队队徽'},awayLogo:{input:'awayLogoFile',label:'客队队徽'},
    logo_data:{input:'logoFile',label:'角标 Logo'},theme_bg:{input:'bgFile',label:'背景图'},font_data:{input:'fontFile',label:'自定义字体'}
  };
  function image(value){return typeof value==='string'&&/^(data:image\/|https?:\/\/|\/|\.\/|uploads\/|assets\/)/i.test(value);}
  function render(key){
    var entry=entries[key],input=document.getElementById(entry.input),info=document.getElementById(entry.input+'Info'),preview=document.getElementById(entry.input+'Preview');
    var value=state[key],exists=key==='font_data'?!!value:image(value),name=state[key+'_filename'];
    info.textContent=exists?(name||'已保存'+entry.label+(key==='font_data'&&state.font_family?' · '+state.font_family:'')):'未上传';
    info.title=info.textContent;input.value='';
    if(key!=='font_data'){
      preview.hidden=!exists;var img=preview.querySelector('img');
      if(exists)img.src=value;else img.removeAttribute('src');
    }
  }
  function init(){Object.keys(entries).forEach(function(key){
    var entry=entries[key],input=document.getElementById(entry.input),host=document.createElement('div');host.className='asset-upload';input.before(host);host.appendChild(input);
    // Native file inputs cannot display a persisted filename. Give the picker
    // and the saved resource separate elements so their labels never overlap.
    input.hidden=true;input.classList.add('asset-native-input');
    var button=document.createElement('button');button.type='button';button.className='btn asset-pick';button.textContent='选择文件';button.setAttribute('aria-label','选择'+entry.label+'文件');button.onclick=function(){input.click();};host.appendChild(button);
    var info=document.createElement('span');info.className='asset-file-info';info.id=entry.input+'Info';info.setAttribute('role','status');host.appendChild(info);input.setAttribute('aria-describedby',info.id);button.setAttribute('aria-describedby',info.id);
    var preview=document.createElement('div');preview.id=entry.input+'Preview';preview.className='asset-preview';preview.hidden=true;input.closest('.frow').after(preview);
    if(key!=='font_data'){var img=document.createElement('img');img.alt='已保存'+entry.label;preview.appendChild(img);}
    render(key);
  });}
  function hydrate(next){state=Object.assign({},next);Object.keys(entries).forEach(render);}
  function accept(patch){
    Object.keys(entries).forEach(function(key){if(Object.prototype.hasOwnProperty.call(patch,key)&&patch[key]!==state[key]&&!Object.prototype.hasOwnProperty.call(patch,key+'_filename'))state[key+'_filename']='';});
    Object.assign(state,patch);Object.keys(entries).forEach(render);
  }
  function pending(key,name){var info=document.getElementById(entries[key].input+'Info');info.textContent='保存中：'+name;info.title=info.textContent;}
  function failed(key){render(key);}
  function background(value){return value|| (image(state.theme_bg)?state.theme_bg:'');}
  window.FBPAssets={init:init,hydrate:hydrate,accept:accept,pending:pending,failed:failed,isImage:image,background:background};
})();
