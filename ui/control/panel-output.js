/* ---------- 生成 URL ---------- */
var BASE = null;
function genUrl(file) {
  return (serverBase || DEFAULT_BASE) + '/titles/' + file;
}
function copyUrl(file) {
  var u = genUrl(file);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(u).then(function () {
      log('URL 已复制: ' + u, true);
    });
  } else {
    log('URL: ' + u, true);
  }
}
function setVis(key, show) {
  var o = {};
  o[key] = show ? true : false;
  sendState(o).then(function (res) {
    if (res) log((show ? '显示' : '隐藏') + ' ' + key, true);
  });
}
function hideAll() {
  sendState({
    scoreboard_show: false,
    clock_show: false,
    lineup_show: false,
    logo_show: false,
  }).then(function (res) {
    if (res) log('已全部隐藏（比分条/计时器/名单/Logo）', true);
  });
}
function copySingleUrl() {
  var u = genUrl('graphics.html');
  $('singleUrl').value = u;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(u).then(function () {
      log('单链接已复制: ' + u, true);
    });
  } else {
    try {
      $('singleUrl').select();
    } catch (e) {}
    log('单链接: ' + u, true);
  }
}
function updateSingleUrl() {
  $('singleUrl').value = genUrl('graphics.html');
}
function genAllUrls() {
  var single = genUrl('graphics.html');
  var ul = [
    'scoreboard.html',
    'clock.html',
    'restart.html',
    'card.html',
    'player.html',
    'goal.html',
    'lineup.html',
  ].map(function (f) {
    return '  ' + f.split('.')[0] + ': ' + genUrl(f);
  });
  var text = [
    '【联合上屏 · 单链接（推荐，一个输入搞定全部动画）】',
    '  Graphics: ' + single,
    '',
    '【旧版 7 个独立模板（可选）】',
  ]
    .concat(ul)
    .join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(function () {
        log('模板 URL 已复制到剪贴板', true);
      })
      .catch(function () {
        log('复制失败，请手动复制:\n' + text, false);
      });
  } else {
    log('模板 URL:\n' + text, true);
  }
  alert('模板 URL（复制到 vMix 网页浏览器输入）:\n\n' + text);
}

/* ---------- vMix 叠层 ---------- */
var vmixInputs = [];
function loadInputs() {
  var api = $('vmixApi').value.trim().replace(/\/+$/, '') + '/';
  fetch(api, { method: 'GET', mode: 'cors' })
    .then(function (r) {
      return r.text();
    })
    .then(function (xml) {
      vmixInputs = [];
      var doc = new DOMParser().parseFromString(xml, 'text/xml');
      doc.querySelectorAll('input').forEach(function (n) {
        if ((n.getAttribute('type') || '').toLowerCase() === 'webbrowser') {
          vmixInputs.push({ number: n.getAttribute('number'), title: n.getAttribute('title') });
        }
      });
      var s = $('overlaySrc');
      s.innerHTML = vmixInputs
        .map(function (i) {
          return (
            '<option value="' +
            i.number +
            '">' +
            escapeHtml(i.title || 'Input' + i.number) +
            '</option>'
          );
        })
        .join('');
      if (!vmixInputs.length) {
        s.innerHTML = '<option value="">— 无输入 —</option>';
      }
      log('已载入 vMix 输入列表(' + vmixInputs.length + ')', true);
    })
    .catch(function (e) {
      log('无法读取 vMix 输入: ' + e.message, false);
    });
}
function overlayOn() {
  vOverlay('OverlayInput' + ($('overlayInput').value || '2'));
}
function overlayOff() {
  vOverlay('OverlayInput' + ($('overlayInput').value || '2') + 'Off');
}
function vOverlay(fn) {
  var api = $('vmixApi').value.trim().replace(/\/+$/, '') + '/';
  var inp = $('overlaySrc').value;
  if (!inp) {
    log('请先选择输入', false);
    return;
  }
  fetch(api + '?Function=' + fn + '&Input=' + inp, { method: 'GET', mode: 'cors' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      log(fn + ' → Input' + inp, true);
    })
    .catch(function (e) {
      log('叠层命令失败: ' + e.message, false);
    });
}
