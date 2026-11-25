'use strict';
const $ = (id) => document.getElementById(id);
const common = [['event.logo', '赛事 Logo 位置']];
const catalog = {
  caption: { logos: common, text: [['caption.text', '实时歌词字幕']] },
  promotion: {
    logos: common,
    text: [
      ['promotion.title', '名单标题'],
      ['promotion.page', '页码'],
      ['promotion.rank', '名次'],
      ['promotion.name', '选手姓名'],
      ['promotion.program', '节目'],
      ['promotion.score', '分数'],
    ],
  },
  football: {
    logos: [['team.homeLogo', '主队 Logo 位置'], ['team.awayLogo', '客队 Logo 位置'], ...common],
    text: [
      ['team.home', '主队队名'],
      ['team.away', '客队队名'],
      ['score.home', '主队比分'],
      ['score.away', '客队比分'],
      ['clock.match', '比赛计时'],
    ],
  },
  stage: {
    logos: common,
    text: [
      ['program.title', '节目名称'],
      ['program.performer', '表演者'],
      ['program.type', '节目类型'],
      ['program.subtitle', '节目副标题'],
      ['event.name', '活动名称'],
    ],
  },
};
let current,
  selections = {},
  working = false;
const moduleName = () => $('module').value;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.error = String(error);
}
function host(action, args = {}) {
  return new Promise((resolve, reject) => {
    if (!window.__adobe_cep__)
      return reject(Error('请从 Photoshop 或 After Effects 的扩展菜单打开插件。'));
    const encoded = encodeURIComponent(JSON.stringify({ action, args }));
    window.__adobe_cep__.evalScript(
      'VMixTemplateAuthor.dispatch(' + JSON.stringify(encoded) + ')',
      (value) => {
        try {
          if (!value || value === 'EvalScript error.')
            throw Error('Adobe 未能载入制作面板，请重新打开应用。');
          const body = JSON.parse(value);
          if (!body.ok) throw Error(body.error);
          resolve(body.result);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}
function resetSelection(kind, selection = null) {
  selections[kind] = selection;
  $(kind + 'Selection').textContent = selection?.name || '';
  $('clear' + kind[0].toUpperCase() + kind.slice(1)).hidden = !selection;
}
function renderCatalog() {
  const isFootball = moduleName() === 'football';
  $('cards').hidden = $('footballPack').hidden = !isFootball;
  $('repeatRowSetting').hidden = moduleName() !== 'promotion';
  $('ae').hidden = current?.host !== 'AE';
  $('base').textContent = current?.host === 'AE' ? '采用 PS 模板' : '沿用已有动效和预设';
  $('insertKit').textContent = {
    football: '插入整套比分条',
    stage: '插入基础节目条',
    caption: '插入歌词文本框',
    promotion: '插入名单标题与样例首行',
  }[moduleName()];
  const contents = catalog[moduleName()];
  for (const group of ['logos', 'text']) {
    const list = group === 'text' ? [...contents[group], ['custom', '普通文字']] : contents[group];
    $(group).replaceChildren(
      ...list.map(([key, name]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.control = key;
        item.textContent = name;
        return item;
      }),
    );
  }
  $('identity').value = current?.[moduleName() + 'Id'] || '';
  resetSelection('base');
  resetSelection('pack');
}
async function refresh() {
  const next = await host('inspect');
  if (next?.token !== current?.token || next?.host !== current?.host) {
    current = next;
    $('module').value = next?.suggestModule || 'football';
    $('name').value = next?.name || '';
    renderCatalog();
    status(next?.token ? '点击控件插入，再在画布中调整。' : '打开文档或合成后即可插入控件。');
  }
  $('document').textContent = next?.token
    ? next.name + ' · ' + next.width + ' × ' + next.height
    : next?.host === 'AE'
      ? '请打开合成'
      : '请打开文档';
}
function args(extra = {}) {
  const target = moduleName();
  return {
    token: current?.token,
    module: target === 'football' ? target : 'stage',
    slot: target === 'football' ? 'scoreboard' : target === 'stage' ? 'program' : target,
    repeatRow: target === 'promotion' && $('repeatRow').checked,
    ...extra,
  };
}
async function run(task) {
  if (working) return;
  working = true;
  $('controls').disabled = $('refresh').disabled = true;
  try {
    await task();
  } catch (error) {
    status(error.message, true);
  } finally {
    working = false;
    $('controls').disabled = !current?.token;
    $('refresh').disabled = false;
  }
}
function insert(control) {
  return run(async () => {
    await host('insert', args({ control, home: $('home').value, away: $('away').value }));
    status('已插入到画布，可移动或调整大小。');
  });
}
async function exportTemplate() {
  const name = $('name').value.trim(),
    id = $('identity').value;
  if (!name) throw Error('请在导出设置中填写模板名称。');
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(id))
    throw Error('模板标识须以小写英文开头，支持数字和连字符。');
  const output = await host('savePath', args({ name }));
  if (!output) {
    status('已取消导出。');
    return;
  }
  const load = window.cep_node?.require;
  if (!load) throw Error('Adobe 面板文件接口不可用。');
  const fs = load('fs'),
    path = load('path'),
    crypto = load('crypto');
  const { Buffer } = load('buffer');
  const suffix = crypto.randomBytes(8).toString('hex');
  const asset = path.join(path.dirname(output), '.vmix-plate-' + suffix + '.png');
  const temporary = path.join(path.dirname(output), '.vmix-export-' + suffix + '.tmp');
  status('正在生成模板…');
  try {
    let result = await host(
      'export',
      args({ name, id, output, asset, base: selections.base?.path, pack: selections.pack?.path }),
    );
    const deadline = Date.now() + 24000;
    while (!result?.done && Date.now() < deadline) {
      await pause(175);
      result = await host('poll');
    }
    if (!result?.done) throw Error('等待 Adobe 渲染超时。');
    if (result.error) throw Error(result.error);
    if (result.png) {
      const file = fs.readFileSync(asset);
      if (file.length > 1874900) throw Error('透明底图超过 1.78 MiB。请换用更小的画布或减少纹理。');
      if (
        file.length < 24 ||
        file.toString('ascii', 1, 4) !== 'PNG' ||
        file.toString('ascii', file.length - 8, file.length - 4) !== 'IEND'
      ) {
        throw Error('Adobe 未生成完整的透明底图。');
      }
      result.template.elements[0].src = 'data:image/png;base64,' + file.toString('base64');
    }
    const json = JSON.stringify(result.template);
    if (Buffer.byteLength(json, 'utf8') > 4 * 1024 * 1024) throw Error('模板超过 4 MiB。');
    fs.writeFileSync(temporary, json, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, output);
    status('已导出 ' + path.basename(output));
  } finally {
    for (const file of [asset, temporary]) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if (error.code !== 'ENOENT') console.error(error);
      }
    }
  }
}
$('controls').addEventListener('click', (event) => {
  const control = event.target.closest('[data-control]')?.dataset.control;
  if (control) insert(control);
});
$('insertKit').onclick = () => insert(moduleName() + '-kit');
$('module').onchange = renderCatalog;
$('refresh').onclick = () => run(refresh);
$('rig').onclick = () =>
  run(async () => {
    await host('rig', args());
    status('已创建 VMIX MOTION，可在 AE 时间轴修改关键帧。');
  });
for (const kind of ['base', 'pack']) {
  $(kind).onclick = () =>
    run(async () => {
      const selection = await host('choose', args({ kind }));
      if (selection) {
        resetSelection(kind, selection);
        if (kind === 'base') {
          $('name').value = selection.name;
          $('identity').value = selection.id;
        }
      }
    });
  $('clear' + kind[0].toUpperCase() + kind.slice(1)).onclick = () => resetSelection(kind);
}
$('export').onclick = () => run(exportTemplate);
window.addEventListener('focus', () => {
  if (!working) run(refresh);
});
run(refresh);
