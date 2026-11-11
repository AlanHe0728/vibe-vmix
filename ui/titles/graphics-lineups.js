/* ================= 名单（4 份，参数化） ================= */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* 读取名单字段；主队首发(xiH)未单独设置时回退到旧版 lineup_* 键，兼容升级前的单名单 */
function luV(pfx, key, d) {
  if (
    key === 'players' &&
    Object.prototype.hasOwnProperty.call(S, pfx + '_players') &&
    S[pfx + '_players'] !== null &&
    S[pfx + '_players'] !== undefined
  )
    return String(S[pfx + '_players']);
  var direct = field(pfx + '_' + key, undefined);
  if (direct !== undefined) return direct;
  if (pfx === 'xiH') {
    var m = {
      team: 'lineup_team',
      subtitle: 'lineup_subtitle',
      color: 'lineup_color',
      players: 'lineup_players',
    };
    if (m[key] !== undefined) {
      var lv = field(m[key], undefined);
      if (lv !== undefined) return lv;
    }
  }
  return d;
}
var LU_STATES = ['xiH', 'xiA', 'subH', 'subA'];
function luActive() {
  var a = field('lineup_active', 'xiH');
  return LU_STATES.indexOf(a) < 0 ? 'xiH' : a;
}
function luIsAll() {
  if (WORKSPACE_PREVIEW && WORKSPACE_PRESENTATION.mode === 'layout') {
    if (WORKSPACE_PRESENTATION.only === 'lineup') return false;
    if (WORKSPACE_PRESENTATION.only === 'lineup_all') return true;
  }
  return field('lineup_mode', 'all') !== 'single';
}
function rosterLines(pfx) {
  return String(luV(pfx, 'players', '') || '')
    .split(/\r?\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}
function rosterRows(list, raw, pfx) {
  list.innerHTML = '';
  raw.forEach(function (line) {
    var num = '',
      name = line,
      cap = false,
      gk = false,
      p = FBPRosterFormat.line(line);
    if (p) {
      num = p.num;
      name = p.name;
      cap = p.captain;
      gk = p.goalkeeper;
    }
    var row = document.createElement('div');
    row.className = 'lu-row';
    var side = pfx.slice(-1) === 'H' ? 'home' : 'away';
    row.dataset.player = side + '|' + Number(num) + '|' + name.trim();
    row.innerHTML =
      '<div class="lu-rn' +
      (num ? '' : ' no-num') +
      '">' +
      (num || '·') +
      '</div><div class="lu-name">' +
      esc(name.trim()) +
      '</div><div class="lu-badges">' +
      (gk ? '<span class="lu-gk" title="守门员" aria-label="守门员">GK</span>' : '') +
      '<span class="lu-cap' +
      (cap ? ' show' : '') +
      '">队长</span></div>';
    list.appendChild(row);
  });
}
function numberColors(el, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#00529f';
  var rgb = [1, 3, 5].map(function (i) {
    var v = parseInt(color.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  var lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  el.style.setProperty('--number-bg', color);
  el.style.setProperty('--number-ink', lum > 0.179 ? '#000000' : '#ffffff');
}
function luBuildAll() {
  var root = $('lineupAll');
  root.innerHTML = '<div class="lu-match-title">比赛阵容</div><div class="lu-teams"></div>';
  var data = LU_STATES.map(rosterLines),
    columns = data.map(function (rows) {
      return rows.length > 12 ? Math.ceil(rows.length / 12) : 1;
    }),
    counts = data.map(function (rows, i) {
      return Math.ceil(rows.length / columns[i]);
    });
  var starterRows = Math.max(counts[0], counts[1], 1),
    subRows = Math.max(counts[2], counts[3], 1),
    rowHeight = Math.max(
      24,
      Math.min(34, Math.floor(PACKAGE.lineupHeight / (starterRows + subRows))),
    );
  root.style.setProperty('--complete-row', rowHeight + 'px');
  var home = String(luV('xiH', 'color', field('colorHome', '#c8102e'))),
    away = String(luV('xiA', 'color', field('colorAway', '#00529f')));
  if (home.toLowerCase() === away.toLowerCase())
    away = home.toLowerCase() === '#00529f' ? '#c8102e' : '#00529f';
  ['H', 'A'].forEach(function (side, teamIndex) {
    var team = document.createElement('div');
    team.className = 'lu-team';
    numberColors(team, teamIndex ? away : home);
    var heading = document.createElement('div');
    heading.className = 'lu-team-title';
    var logo = document.createElement('img'),
      src = field(teamIndex ? 'awayLogo' : 'homeLogo', '');
    if (src) logo.src = src;
    else logo.className = 'empty';
    logo.alt = '';
    var name = document.createElement('span');
    name.className = 'lu-team-name';
    name.textContent = luV(
      'xi' + side,
      'team',
      field(teamIndex ? 'teamAway' : 'teamHome', teamIndex ? '客队' : '主队'),
    );
    var label = document.createElement('span');
    label.className = 'lu-side-label';
    label.textContent = teamIndex ? '客队' : '主队';
    heading.append(logo, name, label);
    team.appendChild(heading);
    ['xi', 'sub'].forEach(function (type, groupIndex) {
      var pfx = type + side,
        index = LU_STATES.indexOf(pfx),
        raw = data[index],
        rows = groupIndex ? subRows : starterRows;
      var title = document.createElement('div');
      title.className = 'lu-group-title';
      title.textContent = groupIndex ? '替补' : '首发';
      var count = document.createElement('span');
      count.textContent = raw.length + ' 人';
      title.appendChild(count);
      team.appendChild(title);
      var list = document.createElement('div');
      list.className = 'lu-team-list';
      list.dataset.roster = pfx;
      rosterRows(list, raw, pfx);
      list.style.gridTemplateColumns = 'repeat(' + columns[index] + ',minmax(0,1fr))';
      list.style.gridTemplateRows = 'repeat(' + rows + ',var(--complete-row))';
      list.style.gridAutoFlow = 'column';
      if (!raw.length) {
        list.classList.add('empty');
        var empty = document.createElement('div');
        empty.className = 'lu-empty';
        empty.textContent = '暂无名单';
        list.appendChild(empty);
      }
      team.appendChild(list);
    });
    root.querySelector('.lu-teams').appendChild(team);
  });
}
function luBuild() {
  var pfx = luActive(),
    id = 'lineup';
  var all = luIsAll(),
    lu = $(id).querySelector('.lu');
  lu.classList.toggle('complete', all);
  if (all) {
    luBuildAll();
    return;
  }
  $(id).style.setProperty('--acc', luV(pfx, 'color', '#C8102E') || '#C8102E');
  $(id + 'Team').textContent = luV(pfx, 'team', '球队');
  $(id + 'Sub').textContent = luV(pfx, 'subtitle', '首发阵容');
  $('lineupRailTitle').textContent = luV(pfx, 'subtitle', '首发阵容');
  var raw = rosterLines(pfx),
    list = $(id + 'List');
  rosterRows(list, raw, pfx);
  numberColors(
    lu,
    String(
      luV(
        pfx,
        'color',
        field(
          pfx.slice(-1) === 'H' ? 'colorHome' : 'colorAway',
          pfx.slice(-1) === 'H' ? '#c8102e' : '#00529f',
        ),
      ),
    ),
  );
  lu.classList.toggle('wide', raw.length > 14);
  lu.style.setProperty('--roster-rows', Math.ceil(raw.length / 2));
}
function luPlay() {
  fitBroadcastText();
}
function luApply() {
  var pfx = luActive(),
    id = 'lineup';
  var show = EDIT || truthy(field('lineup_show', false));
  var was = $(id).classList.contains('on');
  setGraphicVisible(id, show);
  var list = $(id + 'List');
  var sig = JSON.stringify([
    luIsAll(),
    pfx,
    LU_STATES.map(function (k) {
      return ['players', 'team', 'subtitle', 'color'].map(function (n) {
        return luV(k, n, '');
      });
    }),
    S.colorHome,
    S.colorAway,
    S.teamHome,
    S.teamAway,
    S.homeLogo,
    S.awayLogo,
    S.lineup_tick,
  ]);
  // 仅当 状态切换 / 从隐藏→显示 / 内容有变 时重建并重放，避免轮询导致文字闪烁消失
  if (show && (!was || list.getAttribute('data-sig') !== sig)) {
    list.setAttribute('data-sig', sig);
    luBuild();
    luPlay();
    if (was) replayWipe(id);
  }
}
function luApplyAll() {
  luApply();
}

/* ================= Logo ================= */
function logoApply() {
  var d = field('logo_data', '');
  var img = $('logoImg');
  var show = truthy(field('logo_show', false)) && !!(d || '').trim();
  if (d) {
    img.src = d;
  } else {
    img.removeAttribute('src');
  }
  setGraphicVisible('logo', show);
}
