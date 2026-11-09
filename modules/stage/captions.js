'use strict';

(function (root) {
  function lines(value) {
    return typeof value === 'string'
      ? value
          .split(/\r\n|\r|\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  }
  const api = { lines };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageCaptions = api;
})(globalThis);
