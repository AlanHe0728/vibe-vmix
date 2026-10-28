/* Same-origin bridge to the editor. Local preferences never become state patches. */
(function(){
  'use strict';
  var signature='',selected=null,layerButtons={};
  function el(id){return document.getElementById(id);}
  function api(){try{return el('frame').contentWindow.FBPEditor||null;}catch(_){return null;}}
  function invoke(method){var editor=api();if(editor){var result=editor[method].apply(editor,Array.prototype.slice.call(arguments,1));render(editor.snapshot());return result;}}
  function value(id,v){if(document.activeElement!==el(id))el(id).value=v;}
  function settings(){
    invoke('configure',{ratio:el('previewRatio').value,ratioW:el('ratioW').value,ratioH:el('ratioH').value,
      guides:el('safetyGuides').checked,grid:el('showGrid').checked,snap:el('snapGrid').checked,step:el('gridStep').value,alignTo:el('alignReference').value});
  }
  function render(s){
    var changed=selected!==s.selected;selected=s.selected;
    if(changed||document.activeElement!==el('layoutX'))el('layoutX').value=s.x===null?'':Math.round(s.x);
    if(changed||document.activeElement!==el('layoutY'))el('layoutY').value=s.y===null?'':Math.round(s.y);
    value('layoutScale',s.scale);el('layoutScaleText').textContent=Number(s.scale).toFixed(2)+'×';
    document.querySelectorAll('.selected-action,#layoutX,#layoutY,#layoutScale').forEach(function(control){control.disabled=!s.selected;});
    el('layoutStatus').textContent=s.status||'';
    var cfg=s.settings;value('previewRatio',cfg.ratio);value('ratioW',cfg.ratioW);value('ratioH',cfg.ratioH);value('gridStep',cfg.step);value('alignReference',cfg.alignTo);
    el('customRatio').hidden=cfg.ratio!=='custom';el('safetyGuides').checked=cfg.guides;el('showGrid').checked=cfg.grid;el('snapGrid').checked=cfg.snap;
    el('compositionSize').textContent=Math.round(s.frame.width)+' × '+Math.round(s.frame.height)+' px';
    var sig=JSON.stringify(s.layers.map(function(k){return [k.id,k.name];}));
    if(signature!==sig){
      signature=sig;el('layoutLayers').replaceChildren();el('layoutElement').replaceChildren(new Option('选择一个栏目',''));layerButtons={};
      s.layers.forEach(function(layer){
        el('layoutElement').add(new Option(layer.name,layer.id));var row=document.createElement('div');row.className='preview-layer';
        var button=document.createElement('button');button.textContent=layer.name;button.type='button';button.onclick=function(){invoke('select',layer.id);};
        var check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','在预览中显示'+layer.name);check.onchange=function(){invoke('hide',layer.id,!check.checked);};
        row.appendChild(button);row.appendChild(check);el('layoutLayers').appendChild(row);layerButtons[layer.id]={button:button,check:check};
      });
    }
    el('layoutElement').value=s.selected||'';s.layers.forEach(function(k){var row=layerButtons[k.id];row.check.checked=!k.hidden;row.button.classList.toggle('selected',k.id===s.selected);row.button.setAttribute('aria-pressed',String(k.id===s.selected));});
  }
  function connect(){var editor=api();if(editor){editor.embed();render(editor.snapshot());}}
  function toggle(){var closed=document.body.classList.toggle('tools-closed');el('layoutToggle').setAttribute('aria-expanded',String(!closed));el('layoutToggle').classList.toggle('selected',!closed);fit();}
  function applyPosition(){if(!el('layoutX').value.trim()||!el('layoutY').value.trim())return;invoke('position',el('layoutX').value,el('layoutY').value);}
  el('layoutElement').onchange=function(){if(this.value)invoke('select',this.value);};
  el('applyPosition').onclick=applyPosition;
  ['layoutX','layoutY'].forEach(function(id){el(id).onkeydown=function(event){if(event.key==='Enter'){event.preventDefault();applyPosition();}};});
  el('layoutScale').oninput=function(){invoke('scale',this.value,false);};el('layoutScale').onchange=function(){invoke('finishScale');};el('layoutScale').addEventListener('pointercancel',function(){invoke('finishScale');});
  el('resetLayerScale').onclick=function(){var frame=el('frame').contentWindow;if(typeof frame.resetSelScale==='function')frame.resetSelScale();invoke('notify');};
  document.querySelectorAll('[data-align]').forEach(function(button){button.onclick=function(){invoke('align',button.dataset.align);};});
  ['previewRatio','ratioW','ratioH','safetyGuides','showGrid','snapGrid','gridStep','alignReference'].forEach(function(id){el(id).onchange=settings;});
  el('isolateLayer').onclick=function(){invoke('isolate');};el('restoreLayers').onclick=function(){invoke('restore');};
  el('frame').addEventListener('load',connect);
  window.addEventListener('message',function(e){if(e.origin!==location.origin||e.source!==el('frame').contentWindow||!e.data||e.data.type!=='fbp-editor')return;
    var editor=api();if(!editor)return;if(!el('frame').contentDocument.body.classList.contains('embedded-editor'))editor.embed();render(editor.snapshot());
  });
  window.FBPPreviewTools={toggle:toggle,connect:connect,configure:settings};
})();
