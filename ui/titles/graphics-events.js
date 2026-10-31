/* ================= 发球 ================= */
var RST = {
  kickoff: { label: '开球' },
  throwin: { label: '界外球' },
  corner: { label: '角球' },
  goalkick: { label: '球门球' },
  freekick: { label: '任意球' },
  penalty: { label: '点球' },
};
function rstShow(type) {
  var cfg = RST[type] || RST.kickoff;
  setVar('--rst', field('restart_color', '#00C853'));
  $('rstMain').textContent = field('restart_text', '').trim() || cfg.label;
  $('rstBadge').querySelector('img').src =
    'assets/icons/' + (RST[type] ? type : 'kickoff') + '.svg';
  var team = field('restart_team', '').trim(),
    pl = field('restart_player', '').trim(),
    te = $('rstTeam');
  if (team) {
    te.innerHTML =
      '<b>' + team.replace(/</g, '&lt;') + '</b>' + (pl ? '  ·  ' + pl.replace(/</g, '&lt;') : '');
    te.style.display = '';
  } else te.style.display = 'none';
  var b = $('rstBadge'),
    p = $('rst').querySelector('.rst-pill');
  b.classList.remove('in');
  p.classList.remove('in');
  void b.offsetWidth;
  b.classList.add('in');
  p.classList.add('in');
  fitBroadcastText();
  showFor('rst', 4500);
  interrupt('rst');
}

/* ================= 红黄牌 ================= */
function cdShow(type) {
  var red = type === 'red';
  setVar('--cardC', red ? '#E53935' : '#FFD400');
  setVar('--cardDk', red ? '#8E0000' : '#B8860B');
  $('cdType').textContent = red ? '红牌' : '黄牌';
  $('cdCn').textContent = red ? 'RED CARD' : 'YELLOW CARD';
  $('cdNum').textContent = field('card_num', '').trim() || '--';
  $('cdName').textContent = field('card_name', '球员姓名');
  $('cdTeam').textContent = field('card_team', '');
  var rs = field('card_reason', '').trim(),
    r = $('cdReason');
  if (rs) {
    r.textContent = rs;
    r.classList.add('show');
  } else r.classList.remove('show');
  var c = $('cdCard'),
    i = $('card').querySelector('.cd-detail');
  c.classList.remove('in');
  i.classList.remove('in');
  void c.offsetWidth;
  c.classList.add('in');
  i.classList.add('in');
  fitBroadcastText();
  showFor('card', 5000);
  interrupt('card');
}

/* ================= 球员条 ================= */
function plyShow() {
  setVar('--plyr', field('player_color', '#C8102E'));
  $('plyNum').textContent = field('player_num', '').trim() || '--';
  $('plyName').textContent = field('player_name', '球员姓名');
  $('plyTeam').textContent = field('player_team', '');
  $('plyPos').textContent = field('player_pos', '').trim();
  $('ply').querySelector('.ply-meta .dot').hidden =
    !$('plyTeam').textContent || !$('plyPos').textContent;
  var ev = FBPPlayerTitle.get(S),
    e = $('plyEv');
  $('ply').querySelector('.ply-bar').classList.add('has-event');
  e.textContent = ev;
  e.classList.add('show');
  fitBroadcastText();
  showFor('ply', 4500);
  interrupt('ply');
}

/* ================= 进球 ================= */
function goalShow() {
  setVar('--goalC', field('goal_color', '#FFD400'));
  $('gdNum').textContent = field('goal_num', '').trim() || '--';
  $('gdName').textContent = field('goal_name', '进球球员');
  $('gdTeam').textContent = field('goal_team', '');
  $('gdH').textContent = field('goal_scoreHome', '0');
  $('gdA').textContent = field('goal_scoreAway', '0');
  var g = $('gdWord'),
    i = $('goal').querySelector('.gd-info');
  g.classList.remove('in');
  i.classList.remove('in');
  void g.offsetWidth;
  g.classList.add('in');
  i.classList.add('in');
  fitBroadcastText();
  showFor('goal', 5600);
  interrupt('goal');
}

function subShow() {
  setVar('--subColor', field('sub_color', '#c8102e'));
  $('subTeam').textContent = field('sub_team', '球队');
  $('subOffNum').textContent = field('sub_off_num', '--');
  $('subOffName').textContent = field('sub_off_name', '下场球员');
  $('subOnNum').textContent = field('sub_on_num', '--');
  $('subOnName').textContent = field('sub_on_name', '上场球员');
  fitBroadcastText();
  showFor('sub', 5000);
  interrupt('sub');
}
