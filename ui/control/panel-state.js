var PACKAGE = window.FBPPackage;
var DEFAULT_BASE = 'http://localhost:' + PACKAGE.port;
var serverBase = /^https?:$/.test(location.protocol) ? location.origin : DEFAULT_BASE;
function $(id) {
  return document.getElementById(id);
}
var logBox = $('logBox');
function log(txt, ok) {
  var d = document.createElement('div');
  d.innerHTML =
    '<span class="' + (ok ? 'st' : 'er') + '">' + (ok ? '✔' : '✘') + '</span> ' + escapeHtml(txt);
  logBox.appendChild(d);
  while (logBox.children.length > 120) logBox.removeChild(logBox.firstChild);
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
function setConn(ok) {
  $('connDot').className = 'dot ' + (ok ? 'ok' : 'err');
  $('connectionText').textContent = ok ? '服务已连接' : '连接异常';
}

// Legacy fields remain at the UI boundary; all clients share one transport.
function panelAPI(base) {
  base = base || serverBase;
  return BroadcastAPI.create({
    baseURL: base,
    stateURL: base + '/state.json',
    statusURL: base + '/api/d200/status',
  });
}

/* ---------- 连接与状态 ---------- */
function connect() {
  serverBase = $('serverBase').value.trim().replace(/\/+$/, '');
  $('serverBase').value = serverBase;
  persist('fbp_serverBase', serverBase);
  updateSingleUrl();
  fetchState();
}
function fetchState() {
  panelAPI()
    .getState()
    .then(function (s) {
      setConn(true);
      renderLiveFields(s);
      renderMatchStatus(s.status || 'running');
      // 载入赛事预设容器
      PRESETS = s && s._presets && typeof s._presets === 'object' ? s._presets : {};
      refreshPresetSelect();
      // 把状态回填到面板字段(仅非空)
      var map = {
        teamHome: 'teamHome',
        teamAway: 'teamAway',
        scoreHome: 'scoreHome',
        scoreAway: 'scoreAway',
        period: 'period',
        colorHome: 'colorHome',
        colorAway: 'colorAway',
        clock_label: 'clock_label',
        clock_sub: 'clock_sub',
        clock_mode: 'clock_mode',
        clock_mm: 'clock_mm',
        clock_ss: 'clock_ss',
        clock_color: 'clock_color',
        restart_team: 'restart_team',
        restart_player: 'restart_player',
        restart_text: 'restart_text',
        restart_color: 'restart_color',
        card_num: 'card_num',
        card_name: 'card_name',
        card_team: 'card_team',
        card_reason: 'card_reason',
        player_name: 'player_name',
        player_num: 'player_num',
        player_team: 'player_team',
        player_pos: 'player_pos',
        player_event: 'player_event',
        player_color: 'player_color',
        goal_side: 'goal_side',
        card_side: 'card_side',
        player_side: 'player_side',
        sub_side: 'sub_side',
        sub_off_num: 'sub_off_num',
        sub_off_name: 'sub_off_name',
        sub_on_num: 'sub_on_num',
        sub_on_name: 'sub_on_name',
        goal_team: 'goal_team',
        goal_name: 'goal_name',
        goal_num: 'goal_num',
        goal_scoreHome: 'goal_scoreHome',
        goal_scoreAway: 'goal_scoreAway',
        goal_color: 'goal_color',
        xiH_team: 'xiH_team',
        xiH_subtitle: 'xiH_subtitle',
        xiH_color: 'xiH_color',
        xiH_players: 'xiH_players',
        xiA_team: 'xiA_team',
        xiA_subtitle: 'xiA_subtitle',
        xiA_color: 'xiA_color',
        xiA_players: 'xiA_players',
        subH_team: 'subH_team',
        subH_subtitle: 'subH_subtitle',
        subH_color: 'subH_color',
        subH_players: 'subH_players',
        subA_team: 'subA_team',
        subA_subtitle: 'subA_subtitle',
        subA_color: 'subA_color',
        subA_players: 'subA_players',
        theme_skin: 'theme_skin',
        theme_accent: 'theme_accent',
        theme_bg: 'theme_bg',
        theme_font: 'theme_font',
        motion: 'motion',
        animdur: 'animdur',
        wipe_in: 'wipe_in',
        wipe_out: 'wipe_out',
        sb_clockmode: 'sb_clockmode',
        hold_goal: 'hold_goal',
        hold_card: 'hold_card',
        hold_rst: 'hold_rst',
        hold_ply: 'hold_ply',
        hold_sub: 'hold_sub',
        font_family: 'font_family',
      };
      Object.keys(map).forEach(function (k) {
        if (s[k] !== undefined && s[k] !== null) {
          var e = $(map[k]);
          if (e) e.value = k === 'theme_bg' && FBPAssets.isImage(s[k]) ? '' : s[k];
        }
      });
      $('player_event').value = FBPPlayerTitle.get(s);
      if (s.sb_clock_state) {
        $('sb_clockmode').value = s.sb_clock_state.mode;
        var c = s.sb_clock_state,
          elapsed = c.running ? Math.max(0, Date.now() - c.base) : 0;
        var seconds = Math.floor(
          Math.max(0, c.accMs + (c.mode === 'down' ? -elapsed : elapsed)) / 1000,
        );
        $('sb_clock_mm').value = Math.floor(seconds / 60);
        $('sb_clock_ss').value = String(seconds % 60).padStart(2, '0');
      }
      SAVED_SB_LOGOS =
        s.sb_logos_show === undefined
          ? true
          : s.sb_logos_show === true ||
            s.sb_logos_show === 1 ||
            s.sb_logos_show === '1' ||
            s.sb_logos_show === 'true';
      $('sb_logos_show').checked = SAVED_SB_LOGOS;
      FBPLinks.hydrate(s);
      if (window.FBPBatchSub) FBPBatchSub.hydrate(s);
      FBPEvents.hydrate(s);
      FBPChoices.fromState(s);
      FBPAssets.hydrate(s);
      FBPMatchFiles.ready();
      FBPWidgets.sync();
    })
    .catch(function (e) {
      setConn(false);
      $('writeStatus').textContent = '连接失败：' + e.message;
    });
}
/* 把一组字段写入 state.json（合并）。返回 Promise，便于后续刷新面板。 */
var WRITE_QUEUE = Promise.resolve(),
  WRITE_COUNT = 0;
function sendState(patch) {
  var base = serverBase,
    body = typeof patch === 'function' ? null : JSON.stringify(patch);
  WRITE_COUNT++;
  var result = WRITE_QUEUE.then(function () {
    $('writeStatus').textContent = '保存中…';
    if (typeof patch === 'function')
      return Promise.resolve(patch()).then(function (value) {
        patch = value;
        body = JSON.stringify(patch);
      });
  })
    .then(function () {
      return panelAPI(base).update(JSON.parse(body));
    })
    .then(function (res) {
      if (
        res.score &&
        (patch.scoreHome_delta !== undefined ||
          patch.scoreAway_delta !== undefined ||
          patch.scoreHome !== undefined ||
          patch.scoreAway !== undefined)
      ) {
        FBPLinks.acceptScores(res.score);
        REMOTE_SCORES.scoreHome = res.score.home;
        REMOTE_SCORES.scoreAway = res.score.away;
        if (patch.goal_trigger === 'goal') {
          $('goal_scoreHome').value = res.score.home;
          $('goal_scoreAway').value = res.score.away;
        }
      }
      FBPLinks.saved(patch);
      FBPEvents.saved(patch);
      FBPLinks.liveRoster(res.onfield);
      FBPChoices.render(res.controls);
      renderLiveFields(patch, res.score);
      FBPAssets.accept(patch);
      if (patch.status !== undefined) renderMatchStatus(patch.status);
      setConn(true);
      $('writeStatus').textContent = '已保存';
      // Summarize binary fields instead of putting megabytes of base64 in the log.
      var summary = {};
      Object.keys(patch).forEach(function (k) {
        var v = patch[k];
        summary[k] =
          typeof v === 'string' && v.length > 300 ? '[上传数据 ' + v.length + ' 字符]' : v;
      });
      log('写入 state: ' + JSON.stringify(summary), true);
      return res;
    })
    .catch(function (e) {
      log('写入失败: ' + e.message, false);
      setConn(false);
      $('writeStatus').textContent = '保存失败：' + e.message;
      $('log').classList.remove('collapsed');
      document.querySelector('.log-toggle').setAttribute('aria-expanded', 'true');
      return null;
    });
  result = result.then(function (res) {
    WRITE_COUNT--;
    return res;
  });
  WRITE_QUEUE = result.then(function () {});
  return result;
}
/* 发送单个字段 */
function send(key, val) {
  var o = {};
  o[key] = val;
  sendState(o);
}
/* 触发（可重复）：每次都会附带一个递增的 *_tick，模板按 tick 变化去重，
   从而同一动画可反复触发（进多球/多次判罚/多次发球）。 */
var TICK = Date.now();
function nTick() {
  TICK = Math.max(Date.now(), TICK + 1);
  return TICK;
}
/* 触发键 -> 对应的计数键（模板按 *_tick 变化去重） */
var TICK_MAP = {
  score_trigger: 'score_tick',
  sb_clockcmd: 'sb_clock_tick',
  clock_cmd: 'clock_tick',
  restart_trigger: 'restart_tick',
  card_trigger: 'card_tick',
  player_trigger: 'player_tick',
  goal_trigger: 'goal_tick',
  lineup_trigger: 'lineup_tick',
};
function trigger(key, val) {
  var tk = TICK_MAP[key] || key + '_tick';
  var o = {};
  o[key] = val;
  o[tk] = nTick();
  sendState(o);
}
