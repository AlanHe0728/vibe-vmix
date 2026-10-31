/* File operations use the same confirmed, queued writes as the rest of the panel. */
(function () {
  'use strict';
  var busy = false,
    connected = false;
  function el(id) {
    return document.getElementById(id);
  }
  function status(message, failed) {
    var node = el('matchConfigStatus');
    node.textContent = message;
    node.dataset.error = failed ? 'true' : 'false';
  }
  function setBusy(value) {
    busy = value;
    ['matchConfigExport', 'matchConfigImport'].forEach(function (id) {
      el(id).disabled = busy || !connected;
    });
    el('matchConfigExample').disabled = busy;
    el('matchConfigCard').setAttribute('aria-busy', String(value));
  }
  function ready() {
    connected = true;
    setBusy(busy);
  }
  function readState() {
    return fetch(serverBase + '/state.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw Error('无法读取当前配置（HTTP ' + r.status + '）');
      return r.json();
    });
  }
  function download(config, name) {
    var url = URL.createObjectURL(
        new Blob(['\uFEFF', FBPMatchConfig.stringify(config)], {
          type: 'text/plain;charset=utf-8',
        }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }
  function embedLogo(state, key) {
    var value = state[key];
    if (!value || /^data:image\//i.test(value)) return Promise.resolve();
    return fetch(new URL(value, serverBase + '/control/panel.html'))
      .then(function (r) {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (!/^image\//i.test(blob.type)) throw Error('不是图片');
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            state[key] = reader.result;
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () {
        throw Error((key === 'homeLogo' ? '主队' : '客队') + '队徽无法嵌入，请重新上传队徽后导出');
      });
  }
  function exportFile() {
    if (busy || !connected) return Promise.resolve(null);
    setBusy(true);
    status('正在导出…');
    var drafts = {};
    [
      'teamHome',
      'teamAway',
      'colorHome',
      'colorAway',
      'xiH_players',
      'xiA_players',
      'subH_players',
      'subA_players',
    ].forEach(function (key) {
      drafts[key] = el(key).value;
    });
    return WRITE_QUEUE.then(readState)
      .then(function (saved) {
        var state = Object.assign({}, saved, drafts);
        return Promise.all([embedLogo(state, 'homeLogo'), embedLogo(state, 'awayLogo')]).then(
          function () {
            return FBPMatchConfig.fromState(state);
          },
        );
      })
      .then(function (config) {
        var name = FBPMatchConfig.filename(config);
        download(config, name);
        status('已导出 ' + name);
        log('已导出比赛配置：' + name, true);
        return config;
      })
      .catch(function (error) {
        status('导出失败：' + error.message, true);
        log('比赛配置导出失败：' + error.message, false);
        return null;
      })
      .finally(function () {
        setBusy(false);
      });
  }
  function importFile(input) {
    var file = input.files && input.files[0];
    if (!file || busy || !connected) return Promise.resolve(null);
    setBusy(true);
    status('正在检查 ' + file.name + '…');
    var config, snapshot, patch;
    return Promise.resolve()
      .then(function () {
        if (file.size > FBPMatchConfig.MAX_FILE_BYTES)
          throw Error('文件过大，配置文件上限为 16 MB');
        return file.text();
      })
      .then(function (contents) {
        config = FBPMatchConfig.parse(contents);
        return sendState(function () {
          return readState().then(function (current) {
            snapshot = current;
            patch = FBPMatchConfig.toPatch(config, current);
            return patch;
          });
        });
      })
      .then(function (result) {
        if (!result) throw Error('保存未成功，原比赛资料已保留，请检查服务连接后重试');
        var state = Object.assign({}, snapshot, patch);
        if (result.onfield) {
          state.onfield_home = result.onfield.home;
          state.onfield_away = result.onfield.away;
        }
        Object.keys(patch).forEach(function (key) {
          var node = el(key);
          if (node && 'value' in node) node.value = patch[key];
        });
        FBPLinks.resetImports();
        FBPLinks.hydrate(state);
        FBPAssets.hydrate(state);
        FBPChoices.fromState(state);
        FBPWidgets.sync();
        renderLiveFields(state);
        var count = ['home', 'away'].reduce(function (sum, side) {
          var t = config.teams[side];
          return sum + t.starters.length + t.substitutes.length;
        }, 0);
        var message =
          '已载入 ' +
          config.teams.home.name +
          ' vs ' +
          config.teams.away.name +
          ' · ' +
          count +
          ' 人';
        status(message);
        log('比赛配置 ' + file.name + '：' + message, true);
        return config;
      })
      .catch(function (error) {
        status('载入失败：' + error.message, true);
        log('比赛配置载入失败：' + error.message, false);
        return null;
      })
      .finally(function () {
        input.value = '';
        setBusy(false);
      });
  }
  function example() {
    download(FBPMatchConfig.example(), '比赛配置-格式示例.txt');
    status('已下载格式示例');
  }
  window.FBPMatchFiles = {
    ready: ready,
    exportFile: exportFile,
    importFile: importFile,
    example: example,
  };
})();
