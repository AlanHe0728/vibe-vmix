/* Shared browser/Node client. New clients use /api/v1; legacy URLs are configurable. */
(function (global) {
  'use strict';

  function create(options) {
    options = options || {};
    var base = (options.baseURL || (global.location && global.location.origin) || '').replace(
      /\/+$/,
      '',
    );
    var transport =
      options.fetch ||
      function (url, init) {
        return global.fetch(url, init);
      };
    var stateURL = options.stateURL || base + '/api/v1/state';

    function request(url, init, rawState) {
      return transport(url, init).then(function (response) {
        if (response.status === 304)
          return { notModified: true, etag: response.headers.get('ETag') };
        return response.json().then(function (body) {
          if (!response.ok || (!rawState && body.ok === false)) {
            var error = new Error(body.error || 'HTTP ' + response.status);
            error.status = response.status;
            error.code = body.code;
            throw error;
          }
          return { data: body, etag: response.headers.get('ETag'), notModified: false };
        });
      });
    }

    function post(url, payload) {
      return request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      }).then(function (result) {
        return result.data;
      });
    }

    function readState(etag) {
      return request(
        stateURL,
        {
          cache: 'no-cache',
          headers: etag ? { 'If-None-Match': etag } : {},
        },
        true,
      ).then(function (result) {
        return { state: result.data, etag: result.etag, notModified: result.notModified };
      });
    }

    return {
      readState: readState,
      getState: function () {
        return readState().then(function (result) {
          return result.state;
        });
      },
      update: function (patch) {
        return post(stateURL, patch);
      },
      describe: function () {
        return request(base + '/api/v1/module').then(function (result) {
          return result.data.module;
        });
      },
      commands: function () {
        return request(base + '/api/v1/commands').then(function (result) {
          return result.data.commands;
        });
      },
      status: function () {
        return request(options.statusURL || base + '/api/v1/status', { cache: 'no-store' }).then(
          function (result) {
            return result.data.status || result.data;
          },
        );
      },
      execute: function (id, payload) {
        return post(base + '/api/v1/commands/' + encodeURIComponent(id), payload);
      },
    };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.BroadcastAPI = api;
})(typeof window === 'object' ? window : globalThis);
