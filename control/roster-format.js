/* Shared number/name recognition for the panel, titles and Node server. */
(function(root,factory){
  var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FBPRosterFormat=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function digits(value){return String(value==null?'':value).replace(/[０-９]/g,function(c){return String(c.charCodeAt(0)-65296);}).replace(/^\uFEFF/,'').trim();}
  function number(value){var m=digits(value).match(/^(?:#\s*|no\.?\s*|号码\s*[:：]?\s*)?(\d{1,3})\s*号?$/i);return m?m[1]:null;}
  function named(num,name){
    name=String(name==null?'':name).trim();var clean=name.replace(/\s*[*#]+\s*$/,'').replace(/\s*[（(](?:c|队长)[）)]\s*$/i,'').trim();
    if(!clean||!/[A-Za-z\u00c0-\uffff]/.test(clean)||/^[\d\s+\-:：,，;；.．、|/]/.test(clean))return null;
    return {num:num,name:clean,displayName:name,captain:clean!==name};
  }
  function line(value){
    var m=digits(value).match(/^(?:#\s*|no\.?\s*|号码\s*[:：]?\s*)?(\d{1,3})(?!\d)([^\r\n]*)$/i);
    if(!m)return null;
    var name=m[2].trim().replace(/^号(?:球员)?/,'').replace(/^[\s+＋\-－—–:：,，;；.．、·|/]+/,'');
    return named(m[1],name);
  }
  function cells(text){
    var result=[],cell='',quoted=false;
    for(var i=0;i<text.length;i++){var c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if((c===','||c==='，'||c==='\t'||c===';'||c==='；')&&!quoted){result.push(cell.trim());cell='';}else cell+=c;}
    result.push(cell.trim());return result;
  }
  function heading(value){return digits(value).toLowerCase().replace(/[\s_.()（）:：]/g,'');}
  var numberHeading=/^(号码|球衣号码|球员号码|球衣号|背号|球号|号|no|number|jersey|jerseynumber|shirtnumber)$/;
  var nameHeading=/^(姓名|名字|球员|球员姓名|球员名字|队员姓名|name|player|playername|fullname)$/;
  function rows(data){
    var result=[],seen={},columns=null,skipped=0;
    data.forEach(function(row){
      row=row.map(function(v){return String(v==null?'':v).trim();});if(!row.some(Boolean))return;
      var n=row.findIndex(function(v){return numberHeading.test(heading(v));}),p=row.findIndex(function(v){return nameHeading.test(heading(v));});
      if(n>=0&&p>=0){columns={num:n,name:p};return;}
      var player=null;
      if(columns){var num=number(row[columns.num]);if(num!==null)player=named(num,row[columns.name]);}
      else{
        for(var i=0;i+1<row.length&&!player;i++){
          var num=number(row[i]);if(num!==null)player=named(num,row[i+1]);
        }
        if(!player)for(var i=0;i<row.length&&!player;i++)player=line(row[i]);
      }
      if(!player){skipped++;return;}
      var id=Number(player.num)+'|'+player.name;if(seen[id])return;seen[id]=true;result.push(player.num+' '+player.displayName);
    });
    return {text:result.join('\n'),count:result.length,skipped:skipped};
  }
  function text(value){return rows(String(value).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).map(cells));}
  return {line:line,number:number,rows:rows,text:text};
});
