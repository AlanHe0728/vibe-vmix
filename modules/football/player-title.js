// Keep deliberate custom titles; the old baked-in goal label was a bad default.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBPPlayerTitle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    get: function (state) {
      if (typeof state.player_title === 'string' && state.player_title.trim())
        return state.player_title.trim();
      var legacy = String(state.player_event || '').trim();
      return legacy && legacy !== '进球' ? legacy : '球员信息';
    },
  };
});
