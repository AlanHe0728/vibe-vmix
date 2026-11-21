/* ================= 比分条时钟 ================= */
var CB = { mode: 'up', running: false, accMs: 0, base: 0 };
function sbMs() {
  return FBP.clock(CB);
}
function timeText(ms) {
  var t = Math.floor(Math.max(0, ms) / 1000),
    m = Math.floor(t / 60),
    s = t % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function fitClock(el, max, min) {
  el.style.fontSize = max + 'px';
  while (el.scrollWidth > el.clientWidth && max > min) el.style.fontSize = --max + 'px';
}
function sbTick() {
  var c = $('sbClock');
  var time = timeText(sbMs());
  c.textContent = time;
  c.classList.toggle('paused', !CB.running);
  fitClock(c, 25, 14);
  var matchdayClock = $('matchdayClock');
  if (matchdayClock && matchdayClock.textContent !== time) {
    matchdayClock.textContent = time;
    fitMatchdayText(matchdayClock);
  }
}
function sbBoot() {
  sbTick();
  setInterval(sbTick, 250);
}
var SB_STATUS = { running: '进行中', paused: '比赛暂停', half: '中场休息', over: '比赛结束' };
function sbSetStatus(st) {
  var b = $('sbBadge');
  b.classList.remove('in-bar');
  if (st === 'running') {
    b.classList.remove('show', 'over');
  } else {
    b.classList.add('show');
    b.classList.toggle('over', st === 'over');
    $('sbBadgeTx').textContent = SB_STATUS[st] || st;
    if (b.getBoundingClientRect().top < 4) b.classList.add('in-bar');
  }
}
function setLogo(imgId, data) {
  var img = $(imgId);
  var d = (data || '').trim();
  if (d && d.indexOf('data:') === 0) {
    img.src = d;
    img.classList.remove('empty');
  } else {
    img.removeAttribute('src');
    img.classList.add('empty');
  }
}
var SB_MEASURE = document.createElement('canvas').getContext('2d');
function fitScoreboardWidth() {
  var wrap = $('sb').querySelector('.sb-wrap'),
    logos = truthy(field('sb_logos_show', true)),
    mid = logos ? 136 : 102,
    lane = logos ? 257 : 102;
  wrap.classList.toggle('without-logos', !logos);
  var scoreWidth = 0;
  $('sbMid')
    .querySelectorAll('.sc > span')
    .forEach(function (el) {
      var style = getComputedStyle(el);
      SB_MEASURE.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      scoreWidth += SB_MEASURE.measureText(el.textContent).width;
    });
  mid = Math.min(800, Math.max(mid, Math.ceil(scoreWidth + 18)));
  ['sbHome', 'sbAway'].forEach(function (id) {
    var el = $(id);
    el.style.fontSize = '';
    var style = getComputedStyle(el);
    SB_MEASURE.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
    var spacing = parseFloat(style.letterSpacing) || 0,
      text = el.textContent;
    lane = Math.max(
      lane,
      Math.ceil(
        SB_MEASURE.measureText(text).width +
          Math.max(0, Array.from(text).length - 1) * spacing +
          32 +
          (logos ? 42 : 0),
      ),
    );
  });
  lane = Math.min(lane, (1824 - mid) / 2);
  wrap.style.setProperty('--sb-width', lane * 2 + mid + 'px');
  wrap.style.setProperty('--sb-mid', mid + 'px');
}
function sbApply() {
  setVar('--home', field('colorHome', '#C8102E'));
  setVar('--away', field('colorAway', '#00529F'));
  $('sbHome').textContent = field('teamHome', '主队');
  $('sbAway').textContent = field('teamAway', '客队');
  $('sbH').textContent = field('scoreHome', '0');
  $('sbA').textContent = field('scoreAway', '0');
  $('sbPeriod').textContent = field('period', '上半场');
  setLogo('sbLogoH', field('homeLogo', ''));
  setLogo('sbLogoA', field('awayLogo', ''));
  sbSetStatus(field('status', 'running'));
  $('sb').classList.toggle('on', truthy(field('scoreboard_show', true)));
  if ($('matchdayBoard')) applyMatchday();
}

function matchdayInk(hex) {
  var rgb = hex.match(/[\da-f]{2}/gi).map(function (component) {
    var value = parseInt(component, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.4 ? '#000' : '#fff';
}

function fitMatchdayText(el) {
  var cell = el.parentElement;
  if (!cell.clientWidth) return;
  el.style.fontSize = '';
  var style = getComputedStyle(cell);
  var width = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (el.offsetWidth > width) {
    el.style.fontSize = Math.floor((parseFloat(style.fontSize) * width) / el.offsetWidth) + 'px';
  }
}

function applyMatchday() {
  var sb = $('sb'), template = scoreboardTemplate();
  sb.classList.toggle('matchday', Boolean(template));
  if (!template) return;
  var signature = template.id + ':' + template.revision;
  if (signature !== renderedScoreboardTemplate) {
    renderedScoreboardTemplate = signature;
    Object.entries(template.dimensions).forEach(function (entry) {
      setCss('--sb-template-' + entry[0], entry[1] + 'px');
    });
    setCss('--sb-template-brand', template.theme.brand);
    setCss('--sb-template-clock', template.theme.clock);
    setCss('--sb-template-clock-ink', template.theme.clockInk);
    setCss('--sb-template-font', JSON.stringify(template.theme.font));
    var images = document.querySelectorAll('#matchdayBoard img, #matchdayHeader img');
    ['left', 'right', 'headerLeft', 'headerRight'].forEach(function (key, index) {
      var image = images[index];
      var src = template.images[key];
      image.hidden = !src;
      if (src && image.getAttribute('src') !== src) image.src = src;
      if (!src) image.removeAttribute('src');
    });
  }
  var title = String(field('sb_matchday_title', '')).trim();
  $('matchdayHeader').hidden = !title || !truthy(field('sb_matchday_header', false));
  $('matchdayTitle').textContent = title;
  $('matchdayHome').textContent = $('sbHome').textContent;
  $('matchdayAway').textContent = $('sbAway').textContent;
  $('matchdayH').textContent = $('sbH').textContent;
  $('matchdayA').textContent = $('sbA').textContent;
  var root = getComputedStyle(document.documentElement);
  ['home', 'away'].forEach(function (side) {
    sb.style.setProperty('--matchday-' + side + '-ink', matchdayInk(root.getPropertyValue('--' + side)));
  });
}

var renderedScoreboardTemplate;
function scoreboardTemplate() {
  var library = S.scoreboard_templates;
  return $('matchdayBoard') && library && Object.prototype.hasOwnProperty.call(library, S.sb_layout)
    ? library[S.sb_layout] : null;
}

function fitMatchdayBoard() {
  ['matchdayClock', 'matchdayHome', 'matchdayAway', 'matchdayH', 'matchdayA', 'matchdayTitle'].forEach(
    function (id) { fitMatchdayText($(id)); },
  );
}

/* ================= 计时器（正计/倒计） ================= */
var CC = { mode: 'down', running: false, accMs: 0, base: 0 };
function ckMs() {
  return FBP.clock(CC);
}
function ckTick() {
  var ms = ckMs();
  var done = CC.mode === 'down' && CC.accMs > 0 && ms <= 0;
  var el = $('clkTime');
  el.textContent = timeText(ms);
  fitClock(el, 76, 24);
  el.classList.toggle('paused', !CC.running);
  el.classList.toggle('done', done);
  $('clkMode').textContent = CC.mode === 'down' ? '倒计时' : '正计时';
}
function ckBoot() {
  ckTick();
  setInterval(ckTick, 200);
}
function ckApply() {
  setVar('--clockAcc', field('clock_color', '#FFD400'));
  $('clkLabel').textContent = field('clock_label', '中场休息');
  $('clkSub').textContent = field('clock_sub', 'COUNTDOWN');
  setGraphicVisible('clk', truthy(field('clock_show', false)));
}
