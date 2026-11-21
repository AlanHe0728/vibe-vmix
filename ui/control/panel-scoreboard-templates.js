(function () {
  'use strict';

  var templates = {}, active = 'classic', busy = false;

  function message(text, failed) {
    $('scoreboardTemplateStatus').textContent = text;
    $('scoreboardTemplateStatus').dataset.error = String(Boolean(failed));
  }

  function setBusy(value) {
    busy = value;
    ['scoreboardLayout', 'importScoreboardTemplate', 'applyScoreboardFixture'].forEach(function (id) {
      $(id).disabled = value;
    });
    FBPChoices.syncSelects();
  }

  function render() {
    var select = $('scoreboardLayout');
    select.replaceChildren(new Option('经典比分条', 'classic'));
    Object.values(templates).forEach(function (template) {
      select.add(new Option(template.name, template.id));
    });
    select.value = active;
    var template = templates[active];
    var fixtures = $('scoreboardFixture');
    fixtures.replaceChildren();
    if (template) template.fixtures.forEach(function (fixture, index) {
      fixtures.add(new Option(fixture.title + '　' + fixture.home + ' vs ' + fixture.away, index));
    });
    $('scoreboardFixtures').hidden = !fixtures.options.length;
    $('customScoreboardSettings').hidden = !template;
    $('classicScoreboardSettings').hidden = Boolean(template);
    FBPChoices.syncSelects();
  }

  function hydrate(state) {
    if (!PACKAGE.scoreboardTemplates) return;
    $('scoreboardTemplateSettings').hidden = false;
    templates = state.scoreboard_templates || {};
    active = Object.hasOwn(templates, state.sb_layout) ? state.sb_layout : 'classic';
    $('sb_matchday_header').checked = state.sb_matchday_header === true;
    $('sb_matchday_title').value = state.sb_matchday_title || '';
    render();
    FBPWidgets.sync();
  }

  async function importFile(input) {
    var file = input.files[0];
    if (!file || busy) return;
    setBusy(true);
    message('正在导入 ' + file.name + '…');
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('模板文件不能超过 2 MB');
      var template;
      try { template = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); }
      catch (_) { throw Error('请选择有效的比分牌模板 JSON 文件'); }
      var result = await sendState({ scoreboard_template_import: template });
      if (!result) throw Error($('writeStatus').textContent);
      hydrate(await panelAPI().getState());
      message('已导入并应用「' + templates[active].name + '」');
    } catch (error) {
      message('导入失败。' + error.message, true);
    } finally {
      input.value = '';
      setBusy(false);
    }
  }

  async function select(id) {
    if (busy) return;
    setBusy(true);
    if (await sendState({ sb_layout: id })) {
      active = id;
      message('已应用「' + (templates[id]?.name || '经典比分条') + '」');
    } else message($('writeStatus').textContent, true);
    render();
    setBusy(false);
  }

  async function writeHeader() {
    return sendState({
      sb_matchday_header: $('sb_matchday_header').checked,
      sb_matchday_title: $('sb_matchday_title').value.trim(),
    });
  }

  async function applyFixture() {
    var fixture = templates[active]?.fixtures[Number($('scoreboardFixture').value)];
    if (!fixture || busy) return;
    setBusy(true);
    var patch = {
      teamHome: fixture.home,
      teamAway: fixture.away,
      colorHome: fixture.homeColor,
      colorAway: fixture.awayColor,
      sb_matchday_title: fixture.title,
      ...FBPLinks.teamPatch({
        home: { name: fixture.home, color: fixture.homeColor },
        away: { name: fixture.away, color: fixture.awayColor },
      }),
    };
    if (await sendState(patch)) {
      ['teamHome', 'teamAway', 'colorHome', 'colorAway', 'sb_matchday_title'].forEach(function (id) {
        $(id).value = patch[id];
      });
      ['teamHome', 'teamAway'].forEach(function (id) { $(id).dispatchEvent(new Event('input')); });
      message('已套用 ' + fixture.title + ' 的队名和队色');
    } else message($('writeStatus').textContent, true);
    setBusy(false);
  }

  window.FBPScoreboardTemplates = { hydrate, importFile, select, writeHeader, applyFixture };
})();
