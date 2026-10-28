// Shared state transport and clock rendering. Rendering never writes time back.
(function(global){
  var url = new URLSearchParams(location.search).get('state') ||
    ((location.protocol === 'http:' || location.protocol === 'https:') ? location.origin : 'http://localhost:8123')+'/state.json';
  function clock(c){
    if(!c)return 0;
    var elapsed=c.running?Math.max(0,Date.now()-c.base):0;
    return Math.max(0,c.accMs+(c.mode==='down'?-elapsed:elapsed));
  }
  function post(patch){
    return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})
      .then(function(r){return r.json().then(function(s){if(!r.ok||s.ok!==true)throw new Error(s.error||('HTTP '+r.status));return s;});});
  }
  function poll(apply){
    var initialized=false,etag=null;
    function next(){
      fetch(url,{cache:'no-cache',headers:etag?{'If-None-Match':etag}:{}}).then(function(r){
        if(r.status===304)return null;
        if(!r.ok)throw new Error('HTTP '+r.status);
        var nextTag=r.headers.get('ETag');
        if(initialized && nextTag && nextTag===etag)return null;
        return r.json().then(function(s){apply(s,!initialized);initialized=true;etag=nextTag;});
      }).catch(function(e){console.warn('状态读取失败:',e.message);}).then(function(){setTimeout(next,200);});
    }
    next();
  }
  global.FBP={url:url,clock:clock,post:post,poll:poll};
})(window);
