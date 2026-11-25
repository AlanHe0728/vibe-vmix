// Shared state transport and clock rendering. Rendering never writes time back.
(function (global) {
  var url =
    new URLSearchParams(location.search).get('state') ||
    (location.protocol === 'http:' || location.protocol === 'https:'
      ? location.origin
      : 'http://localhost:8123') + '/state.json';
  function clock(c) {
    if (!c) return 0;
    var elapsed = c.running ? Math.max(0, Date.now() - c.base) : 0;
    return Math.max(0, c.accMs + (c.mode === 'down' ? -elapsed : elapsed));
  }
  var api = BroadcastAPI.create({ stateURL: url });
  function post(patch) {
    return api.update(patch);
  }
  function poll(apply) {
    var initialized = false,
      etag = null,
      failures = 0;
    function next() {
      api
        .readState(etag)
        .then(function (result) {
          failures = 0;
          document.documentElement.style.visibility = '';
          if (result.notModified || (initialized && result.etag && result.etag === etag)) return;
          apply(result.state, !initialized);
          initialized = true;
          etag = result.etag;
        })
        .catch(function (e) {
          failures++;
          if (failures >= 3) document.documentElement.style.visibility = 'hidden';
          console.warn('状态读取失败:', e.message);
        })
        .then(function () {
          setTimeout(next, 200);
        });
    }
    next();
  }
  global.FBP = { url: url, clock: clock, post: post, poll: poll };
})(window);
