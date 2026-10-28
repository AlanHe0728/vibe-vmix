/* Pre-match XI drafts: stable bar positions, then one atomic save for both teams. */
(function(){
  'use strict';
  var saved={xiH_players:'',xiA_players:'',subH_players:'',subA_players:''},signatures={},sheets={},deleted={},initialized=false;
  function el(id){return document.getElementById(id);}
  function suffix(side){return side==='away'?'A':'H';}
  function title(side){return el(side==='home'?'teamHome':'teamAway').value.trim()||(side==='home'?'主队':'客队');}
  function message(text){el('squadStatus').textContent=text;}
  function editMessage(side,text){var note=el('squad_'+side+'_edit_status');note.textContent=text;note.hidden=!text;message(text);}
  function selected(people){return new Set(people.filter(function(p){return p.starting;}).map(function(p){return p.id;}));}
  function changeRole(side,id,key){
    try{var people=collect(side),player=people.find(function(p){return p.id===id;});if(!player)return;
      player[key]=!player[key];
      if(key==='goalkeeper'&&!player.goalkeeper&&/^(GK|门将|守门员)$/i.test(player.position))player.position='';
      setLists(side,people,selected(people));
      editMessage(side,player.num+'号 '+player.name+' 的'+(key==='goalkeeper'?'GK':'队长')+'标记已更新');
      var row=Array.from(el('squad_'+side+'_rows').children).find(function(node){return node.dataset.player===id;});
      if(row)row.querySelector('[data-role='+key+']').focus({preventScroll:true});
    }catch(error){editMessage(side,error.message);}
  }
  function forgetDeletion(side){delete deleted[side];el('squad_'+side+'_undo').hidden=true;}
  function remove(side,id){
    try{var people=collect(side),index=people.findIndex(function(p){return p.id===id;}),player=people[index];if(!player)return;
      deleted[side]=player;setLists(side,people.filter(function(p){return p.id!==id;}),selected(people));
      el('squad_'+side+'_undo').hidden=false;editMessage(side,'已删除 '+player.num+'号 '+player.name+'');
      var rows=el('squad_'+side+'_rows').querySelectorAll('.squad-row:not([hidden])');
      (rows[Math.min(index,rows.length-1)]?.querySelector('.squad-delete')||el('squad_'+side+'_add')).focus({preventScroll:true});
    }catch(error){editMessage(side,error.message);}
  }
  function undo(side){
    try{var player=deleted[side];if(!player)return;var people=collect(side),chosen=selected(people);
      if(!people.some(function(p){return p.id===player.id;})){if(people.length>=240)throw Error('总名单最多支持 240 人，请先删除一位球员再撤销。');people.push(player);people.sort(function(a,b){return Number(a.num)-Number(b.num)||a.name.localeCompare(b.name);});if(player.starting)chosen.add(player.id);setLists(side,people,chosen);}
      forgetDeletion(side);editMessage(side,'已恢复 '+player.num+'号 '+player.name+'');
    }catch(error){editMessage(side,error.message);}
  }
  function toggleAdd(side,open){
    var form=el('squad_'+side+'_add_form');form.hidden=!open;el('squad_'+side+'_add').setAttribute('aria-expanded',String(open));
    if(open)el('squad_'+side+'_num').focus();else el('squad_'+side+'_add').focus({preventScroll:true});
  }
  function add(side){
    try{var num=FBPRosterFormat.number(el('squad_'+side+'_num').value),name=el('squad_'+side+'_name').value.trim();
      if(num===null)throw Error('请填写 1 至 3 位球衣号码。');
      var player=FBPRosterFormat.line(num+' '+name);if(!player)throw Error('请填写有效的球员姓名。');
      var pos=el('squad_'+side+'_position').value.trim();if(/[\[\]【】()（）]/.test(pos))throw Error('位置请直接填写文字，例如后卫或 GK。');
      player.position=pos||player.position;player.goalkeeper=player.goalkeeper||el('squad_'+side+'_gk').checked||/^(GK|门将|守门员)$/i.test(pos);
      player.captain=player.captain||el('squad_'+side+'_captain').checked;player.id=side+'|'+Number(player.num)+'|'+player.name;
      var people=collect(side);if(people.some(function(p){return p.id===player.id;}))throw Error('名单中已有这位球员');
      if(people.length>=240)throw Error('总名单最多支持 240 人');
      var chosen=selected(people);people.push(player);people.sort(function(a,b){return Number(a.num)-Number(b.num)||a.name.localeCompare(b.name);});el('squad_'+side+'_search').value='';setLists(side,people,chosen);
      if(deleted[side]&&deleted[side].id===player.id)forgetDeletion(side);
      el('squad_'+side+'_add_form').reset();editMessage(side,'已添加 '+player.num+'号 '+player.name+'');el('squad_'+side+'_num').focus();
    }catch(error){editMessage(side,error.message);}
  }
  function collect(side){
    var map=new Map(),s=suffix(side);
    ['xi','sub'].forEach(function(prefix){String(el(prefix+s+'_players').value).split(/\r\n|\n|\r/).forEach(function(line,i){if(!line.trim())return;var p=FBPRosterFormat.line(line);if(!p)throw Error(title(side)+(prefix==='xi'?'首发':'替补')+'第'+(i+1)+'行无法识别，请先填写号码和姓名');
      var id=side+'|'+Number(p.num)+'|'+p.name,old=map.get(id);if(old){old.starting=old.starting||prefix==='xi';old.captain=old.captain||p.captain;old.goalkeeper=old.goalkeeper||p.goalkeeper;old.position=old.position||p.position;}else map.set(id,Object.assign({},p,{id:id,starting:prefix==='xi'}));
    });});return Array.from(map.values()).sort(function(a,b){return Number(a.num)-Number(b.num)||a.name.localeCompare(b.name);});
  }
  function setLists(side,players,selected){
    var s=suffix(side);['xi','sub'].forEach(function(prefix){el(prefix+s+'_players').value=players.filter(function(p){return selected.has(p.id)===(prefix==='xi');}).map(FBPRosterFormat.format).join('\n');});FBPLinks.rebuild();
  }
  function dirty(side){var s=suffix(side);return ['xi','sub'].some(function(p){return saved[p+s+'_players']!==el(p+s+'_players').value;});}
  function filter(side){var query=el('squad_'+side+'_search').value.trim().toLowerCase();el('squad_'+side+'_rows').querySelectorAll('.squad-row').forEach(function(row){row.hidden=!!query&&!row.dataset.search.includes(query);});}
  function refresh(){
    if(!initialized)return;
    ['home','away'].forEach(function(side){try{
      var people=collect(side),root=el('squad_'+side+'_rows'),signature=JSON.stringify(people.map(function(p){return [p.id,p.captain,p.goalkeeper,p.position];}));
      el('squad_'+side+'_title').textContent=(side==='home'?'主队 · ':'客队 · ')+title(side);
      el('squad_'+side+'_count').textContent='首发 '+people.filter(function(p){return p.starting;}).length+' 人 / 总名单 '+people.length+' 人'+(dirty(side)?' · 未保存':'');
      if(signatures[side]!==signature){signatures[side]=signature;root.replaceChildren();
        people.forEach(function(p){var row=document.createElement('div');row.className='squad-row';row.dataset.player=p.id;row.dataset.search=(p.num+' '+p.name).toLowerCase();var label=document.createElement('label');label.className='squad-select';
          var num=document.createElement('span');num.className='squad-number';num.textContent=p.num;
          var name=document.createElement('span');name.className='squad-name';name.textContent=p.name;
          var roles=document.createElement('span');roles.className='squad-role';roles.textContent=p.position==='GK'?'':p.position;
          var text=document.createElement('span');text.className='squad-selection-label';text.textContent='首发';
          var check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',title(side)+' '+p.num+'号 '+p.name+' 首发');
          check.addEventListener('change',function(){try{var all=collect(side),selected=new Set(all.filter(function(item){return item.starting;}).map(function(item){return item.id;}));if(check.checked)selected.add(p.id);else selected.delete(p.id);setLists(side,all,selected);message('首发已修改');}catch(error){message(error.message);refresh();}});
          var removeButton=document.createElement('button');removeButton.type='button';removeButton.className='btn sm squad-delete';removeButton.textContent='删除';removeButton.setAttribute('aria-label','删除 '+p.num+'号 '+p.name);removeButton.addEventListener('click',function(){remove(side,p.id);});
          var roleActions=document.createElement('div');roleActions.className='squad-role-actions';
          [['goalkeeper','GK','守门员 GK'],['captain','队长','队长']].forEach(function(role){var button=document.createElement('button');button.type='button';button.className='btn sm squad-role-toggle';button.dataset.role=role[0];button.textContent=role[1];button.setAttribute('aria-pressed',String(!!p[role[0]]));button.setAttribute('aria-label',title(side)+' '+p.num+'号 '+p.name+' '+role[2]);button.title=(p[role[0]]?'取消':'设为')+role[2];button.addEventListener('click',function(){changeRole(side,p.id,role[0]);});roleActions.appendChild(button);});
          label.append(num,name,roles,text,check);row.append(label,roleActions,removeButton);root.appendChild(row);
        });
        if(!people.length){var empty=document.createElement('p');empty.className='field-note';empty.textContent='暂无球员';root.appendChild(empty);}
      }
      people.forEach(function(p,i){var row=root.children[i];row.querySelector('input').checked=p.starting;row.dataset.selected=String(p.starting);});filter(side);
    }catch(error){message(error.message);}});
  }
  function accept(patch){['xiH_players','xiA_players','subH_players','subA_players'].forEach(function(key){if(patch[key]!==undefined)saved[key]=String(patch[key]);});refresh();if(initialized)['home','away'].forEach(function(side){var s=suffix(side);if((patch['xi'+s+'_players']!==undefined||patch['sub'+s+'_players']!==undefined)&&!dirty(side)){var note=el('squad_'+side+'_edit_status');note.hidden=true;note.textContent='';}});}
  function selectedSaved(side){var s=suffix(side),ids=new Set();String(saved['xi'+s+'_players']||'').split(/\r\n|\n|\r/).forEach(function(line){var p=FBPRosterFormat.line(line);if(p)ids.add(side+'|'+Number(p.num)+'|'+p.name);});return ids;}
  function replace(side,text){
    var parsed=FBPRosterFormat.text(text);if(!parsed.count)throw Error('未识别到球员，原名单已保留');if(parsed.count>240)throw Error('总名单最多支持 240 人');
    var chosen;try{chosen=new Set(collect(side).filter(function(p){return p.starting;}).map(function(p){return p.id;}));}catch(_){chosen=selectedSaved(side);}
    var people=parsed.text.split('\n').map(function(line){var p=FBPRosterFormat.line(line);p.id=side+'|'+Number(p.num)+'|'+p.name;return p;});
    forgetDeletion(side);setLists(side,people,chosen);editMessage(side,title(side)+' 已读取 '+parsed.count+' 人'+(parsed.skipped?'，略过 '+parsed.skipped+' 行说明内容':''));
  }
  function applySheet(side,index){try{replace(side,sheets[side][Number(index)].text);}catch(error){editMessage(side,'导入失败：'+error.message);}}
  function importFile(side,input){
    var file=input.files&&input.files[0];if(!file)return Promise.resolve();
    return Promise.resolve().then(function(){if(file.size>16*1024*1024)throw Error('名单文件上限为 16 MB');
      if(/\.(xlsx|xls|xlsm)$/i.test(file.name))return file.arrayBuffer().then(function(bytes){var book=XLSX.read(bytes,{type:'array',cellHTML:false,cellFormula:false});return book.SheetNames.map(function(name){var parsed=FBPRosterFormat.rows(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:false,defval:'',blankrows:false}));parsed.name=name;return parsed;});});
      return file.text().then(function(text){return [FBPRosterFormat.text(text)];});
    }).then(function(entries){var valid=entries.findIndex(function(s){return s.count>0;});if(valid<0)throw Error('未识别到球员，原名单已保留');sheets[side]=entries;var menu=el('squad_'+side+'_sheet');menu.replaceChildren();entries.forEach(function(s,i){var o=new Option((s.name||file.name)+' · '+s.count+' 人',String(i));o.disabled=!s.count;menu.add(o);});menu.value=String(valid);el('squad_'+side+'_sheets').hidden=entries.length<2;applySheet(side,valid);}).catch(function(error){editMessage(side,'导入失败：'+error.message);}).finally(function(){input.value='';});
  }
  function save(show){
    var patch={};try{['home','away'].forEach(function(side){var list=collect(side),s=suffix(side);['xi','sub'].forEach(function(p){['players','team','color','subtitle'].forEach(function(key){patch[p+s+'_'+key]=el(p+s+'_'+key).value;});});patch['onfield_'+side]=list.filter(function(p){return p.starting;}).map(function(p){return p.id;});});}catch(error){message(error.message);return Promise.resolve(null);}
    if(show){patch.lineup_mode='all';patch.lineup_show=true;patch.lineup_tick=nTick();}
    return sendState(patch).then(function(res){message(res?'双方首发与替补已保存'+(show?'并上屏':''):'保存失败，草稿已保留');refresh();return res;});
  }
  function resetImports(){sheets={};if(!initialized)return;['home','away'].forEach(function(side){el('squad_'+side+'_sheets').hidden=true;el('squad_'+side+'_sheet').replaceChildren();forgetDeletion(side);el('squad_'+side+'_edit_status').hidden=true;el('squad_'+side+'_edit_status').textContent='';el('squad_'+side+'_add_form').reset();el('squad_'+side+'_add_form').hidden=true;el('squad_'+side+'_add').setAttribute('aria-expanded','false');});}
  function init(){
    if(initialized)return;initialized=true;var root=el('squadPicker');root.innerHTML='<div class="section-heading"><h2>总名单</h2></div><div class="squad-grid"></div><div class="squad-footer"><div class="btns"><button class="btn" id="squadSave">保存双方首发</button><button class="btn" id="squadShow">保存并显示完整阵容</button></div><p class="field-note" id="squadStatus" role="status"></p></div>';
    ['home','away'].forEach(function(side){var card=document.createElement('div');card.className='card squad-card';card.innerHTML='<h3 id="squad_'+side+'_title"></h3><p class="field-note" id="squad_'+side+'_count"></p><details class="squad-import" id="squad_'+side+'_importer"><summary>导入完整名单</summary><div class="squad-import-content"><label for="squad_'+side+'_file">名单文件（TXT / CSV / Excel）</label><input id="squad_'+side+'_file" type="file" accept=".txt,.csv,.tsv,.xlsx,.xls,.xlsm"><div id="squad_'+side+'_sheets" class="squad-sheets" hidden><label for="squad_'+side+'_sheet">Excel 工作表</label><select id="squad_'+side+'_sheet"></select></div><label for="squad_'+side+'_paste">粘贴名单</label><textarea id="squad_'+side+'_paste" placeholder="1 张三 (GK)&#10;10 李四 (C)"></textarea><button class="btn sm" id="squad_'+side+'_read">读取粘贴名单</button></div></details><input type="search" id="squad_'+side+'_search" aria-label="按号码或姓名筛选总名单" placeholder="查找号码或姓名"><div class="squad-tools"><button type="button" class="btn sm" id="squad_'+side+'_add" aria-expanded="false" aria-controls="squad_'+side+'_add_form">添加球员</button><button class="btn sm" id="squad_'+side+'_clear">取消全部首发</button><button class="btn sm" id="squad_'+side+'_restore">恢复已保存首发</button><button class="btn sm" id="squad_'+side+'_undo" hidden>撤销删除</button></div><form class="squad-add-form" id="squad_'+side+'_add_form" aria-label="添加'+(side==='home'?'主队':'客队')+'球员" hidden><div class="squad-add-fields"><label>号码<input id="squad_'+side+'_num" type="text" inputmode="numeric" maxlength="12" autocomplete="off" required placeholder="12"></label><label>姓名<input id="squad_'+side+'_name" type="text" autocomplete="off" required placeholder="球员姓名"></label><label>位置（可选）<input id="squad_'+side+'_position" type="text" autocomplete="off" placeholder="如：后卫"></label></div><div class="squad-add-roles"><label><input type="checkbox" id="squad_'+side+'_gk">守门员 GK</label><label><input type="checkbox" id="squad_'+side+'_captain">队长</label></div><div class="squad-add-actions"><button type="submit" class="btn sm">添加</button><button type="button" class="btn sm" id="squad_'+side+'_cancel">收起</button></div></form><p id="squad_'+side+'_edit_status" class="field-note squad-edit-status" role="status" hidden></p><div class="squad-rows" id="squad_'+side+'_rows"></div>';root.querySelector('.squad-grid').appendChild(card);
      el('squad_'+side+'_file').addEventListener('change',function(){importFile(side,this);});el('squad_'+side+'_sheet').addEventListener('change',function(){applySheet(side,this.value);});el('squad_'+side+'_search').addEventListener('input',function(){filter(side);});
      el('squad_'+side+'_read').addEventListener('click',function(){try{replace(side,el('squad_'+side+'_paste').value);}catch(error){editMessage(side,error.message);}});
      el('squad_'+side+'_add').addEventListener('click',function(){toggleAdd(side,el('squad_'+side+'_add_form').hidden);});el('squad_'+side+'_cancel').addEventListener('click',function(){toggleAdd(side,false);});el('squad_'+side+'_add_form').addEventListener('submit',function(event){event.preventDefault();add(side);});el('squad_'+side+'_undo').addEventListener('click',function(){undo(side);});
      ['clear','restore'].forEach(function(action){el('squad_'+side+'_'+action).addEventListener('click',function(){try{setLists(side,collect(side),action==='clear'?new Set():selectedSaved(side));message('首发选择已更新');}catch(error){message(error.message);}});});
    });el('squadSave').addEventListener('click',function(){save(false);});el('squadShow').addEventListener('click',function(){save(true);});
  }
  window.FBPRosterPicker={init:init,refresh:refresh,accept:accept,resetImports:resetImports,save:save,importFile:importFile};
})();
