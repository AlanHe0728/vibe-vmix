var BASE = 'http://localhost:' + window.FBPPackage.port;
var SERVED = false;
try {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    BASE = location.origin;
    SERVED = true;
  }
} catch (e) {}

function $(id) {
  return document.getElementById(id);
}

var TEMPLATES = [
  { key: 'graphics', file: 'graphics.html', label: '联合(单链接)' },
  { key: 'scoreboard', file: 'scoreboard.html', label: '比分条' },
  { key: 'clock', file: 'clock.html', label: '计时器' },
  { key: 'restart', file: 'restart.html', label: '发球' },
  { key: 'card', file: 'card.html', label: '红黄牌' },
  { key: 'player', file: 'player.html', label: '球员条' },
  { key: 'goal', file: 'goal.html', label: '进球' },
  { key: 'sub', file: 'graphics.html?only=sub', label: '换人' },
  { key: 'lineup', file: 'lineup.html', label: '名单' },
];
var current = 0;

var tabs = $('tabs');
TEMPLATES.forEach(function (t, i) {
  var b = document.createElement('button');
  b.textContent = t.label;
  b.onclick = function () {
    select(i);
  };
  tabs.appendChild(b);
});
function select(i) {
  current = i;
  var t = TEMPLATES[i];
  var frame = $('frame');
  var q = t.file.indexOf('?') >= 0 ? '&edit=1' : '?edit=1';
  frame.src = BASE + '/titles/' + t.file + q;
  Array.prototype.forEach.call(tabs.children, function (b, j) {
    b.classList.toggle('on', j === i);
    b.setAttribute('aria-pressed', String(j === i));
  });
  fit();
}
function reload() {
  select(current);
}

function openPanel() {
  var url = BASE + '/control/panel.html';
  if (SERVED) {
    window.open(url, '_blank');
  } else {
    showBanner(
      '你正在用 file:// 直接打开本页（服务器未参与）。请先双击 <code>control\\启动控制面板.bat</code> 启动服务器，再用下面的地址访问：<br>控制面板：<b>' +
        url +
        '</b><br>预览监控：<b>' +
        BASE +
        '/control/preview.html</b>',
    );
  }
}

function showBanner(html) {
  var b = $('banner');
  b.innerHTML = html;
  b.classList.remove('hidden');
  fit();
}
function hideBanner() {
  $('banner').classList.add('hidden');
  fit();
}

function checkServer() {
  if (!SERVED) {
    showBanner(
      '本页必须通过<b>服务器</b>访问才能预览，不能直接双击文件打开。<br>请先双击 <code>control\\启动控制面板.bat</code>，然后在浏览器地址栏输入：<b>' +
        BASE +
        '/control/preview.html</b>',
    );
    return Promise.resolve(false);
  }
  return fetch(BASE + '/state.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function () {
      hideBanner();
      return true;
    })
    .catch(function () {
      showBanner(
        '⚠️ 无法连接服务器（端口 8123 未启动）。<br>请双击 <code>control\\启动控制面板.bat</code> 启动服务器，然后点「刷新模板」。<br>也可在控制台查看服务器是否报错（如端口被占用）。',
      );
      return false;
    });
}

function fit() {
  var w = $('wrap').clientWidth,
    h = $('wrap').clientHeight;
  if (!w || !h) return;
  var s = Math.min(w / 1920, h / 1080);
  var pw = 1920 * s,
    ph = 1080 * s;
  var player = $('player');
  player.style.width = pw + 'px';
  player.style.height = ph + 'px';
  player.style.left = (w - pw) / 2 + 'px';
  player.style.top = (h - ph) / 2 + 'px';
  $('frame').style.transform = 'scale(' + s + ')';
}
window.addEventListener('resize', fit);

checkServer().then(function () {
  select(0);
});
