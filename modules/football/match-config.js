/* Portable, versioned match files contain team data only, never executable state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./roster-format'));
  else root.FBPMatchConfig = factory(root.FBPRosterFormat);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (roster) {
  'use strict';
  var FORMAT = 'vibe-vmix-match',
    VERSION = 1,
    MAX_FILE_BYTES = 16 * 1024 * 1024;
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error(label + '必须是对象');
    return value;
  }
  function text(value, label, max, empty) {
    if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value))
      throw Error(label + '必须是单行文字');
    value = value.trim();
    if ((!empty && !value) || value.length > max)
      throw Error(label + '请填写' + (empty ? '不超过' : '1–') + max + '个字符');
    return value;
  }
  function flag(value, label) {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw Error(label + '请使用 true 或 false');
    return value;
  }
  function player(value, label) {
    object(value, label);
    var num = roster.number(value.number);
    if (num === null) throw Error(label + '的号码须为 0–999');
    var name = text(value.name, label + '姓名', 120, false),
      parsed = roster.line(num + ' ' + name);
    if (!parsed) throw Error(label + '的姓名无法识别');
    var pos = text(value.position === undefined ? '' : value.position, label + '位置', 40, true);
    if (/[()（）\[\]【】]/.test(pos)) throw Error(label + '位置不能包含括号');
    if (/^(gk|goalkeeper|门将|守门员)$/i.test(pos)) pos = 'GK';
    return {
      number: num,
      name: parsed.name,
      position: pos || parsed.position,
      captain: flag(value.captain, label + '队长标记') || parsed.captain,
      goalkeeper: flag(value.goalkeeper, label + '守门员标记') || parsed.goalkeeper || pos === 'GK',
    };
  }
  function logo(value, label) {
    if (value === undefined || value === null || value === '') return { data: '', filename: '' };
    object(value, label);
    var data = value.data === undefined ? '' : value.data;
    if (typeof data !== 'string' || data.length > 6 * 1024 * 1024)
      throw Error(label + '须小于约 4.5 MB');
    if (
      data &&
      !/^data:image\/(?:png|apng|jpe?g|gif|webp|avif|bmp|tiff|svg\+xml|x-icon|vnd\.microsoft\.icon)(?:;charset=[\w-]+)?;base64,[A-Za-z0-9+/\r\n]+=*$/i.test(
        data,
      )
    )
      throw Error(label + '须使用内嵌的图片 data URI，请通过控制台导出');
    var filename = data
      ? text(
          value.filename === undefined ? '' : value.filename,
          label + '文件名',
          200,
          true,
        ).replace(/^.*[\\/]/, '')
      : '';
    return { data: data, filename: filename };
  }
  function team(value, side) {
    object(value, side);
    var color = value.color === undefined ? (side === '主队' ? '#C8102E' : '#00529F') : value.color;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      throw Error(side + '颜色请使用 #RRGGBB 格式');
    var result = {
        name: text(value.name, side + '名称', 80, false),
        color: color,
        logo: logo(value.logo, side + '队徽'),
      },
      seen = {};
    ['starters', 'substitutes'].forEach(function (key) {
      var label = side + (key === 'starters' ? '首发' : '替补');
      if (!Array.isArray(value[key]) || value[key].length > 120)
        throw Error(label + '必须是数组，最多 120 人');
      result[key] = value[key].map(function (item, i) {
        var p = player(item, label + '第' + (i + 1) + '行'),
          id = Number(p.number) + '|' + p.name;
        if (seen[id]) throw Error(side + '名单中重复出现 ' + p.number + '号 ' + p.name);
        seen[id] = true;
        return p;
      });
    });
    return result;
  }
  function normalize(value) {
    object(value, '比赛配置');
    if (value.format !== FORMAT)
      throw Error('不是比赛配置文件，请选择控制台导出的 TXT 或下载格式示例');
    if (value.version !== VERSION) throw Error('不支持此配置版本，请使用 version: 1');
    object(value.teams, 'teams');
    return {
      format: FORMAT,
      version: VERSION,
      teams: { home: team(value.teams.home, '主队'), away: team(value.teams.away, '客队') },
    };
  }
  function parse(value) {
    if (typeof value !== 'string') throw Error('配置文件必须是 UTF-8 文本');
    var data;
    try {
      data = JSON.parse(value.replace(/^\uFEFF/, ''));
    } catch (_) {
      throw Error('配置文件格式有误，请按示例使用 JSON 格式的 TXT 文件');
    }
    return normalize(data);
  }
  function fromState(state) {
    var teams = {};
    ['home', 'away'].forEach(function (side) {
      var suffix = side === 'home' ? 'H' : 'A',
        title = side === 'home' ? '主队' : '客队';
      var t = {
        name: state[side === 'home' ? 'teamHome' : 'teamAway'],
        color: state[side === 'home' ? 'colorHome' : 'colorAway'],
        logo: {
          data: state[side === 'home' ? 'homeLogo' : 'awayLogo'] || '',
          filename: state[(side === 'home' ? 'homeLogo' : 'awayLogo') + '_filename'] || '',
        },
      };
      ['xi', 'sub'].forEach(function (prefix) {
        var key = prefix + suffix + '_players',
          raw =
            state[key] === undefined && key === 'xiH_players' ? state.lineup_players : state[key];
        t[prefix === 'xi' ? 'starters' : 'substitutes'] = String(raw || '')
          .split(/\r\n|\n|\r/)
          .filter(function (s) {
            return s.trim();
          })
          .map(function (line, i) {
            var p = roster.line(line);
            if (!p)
              throw Error(
                title +
                  (prefix === 'xi' ? '首发' : '替补') +
                  '第' +
                  (i + 1) +
                  '行无法识别，请填写号码和姓名',
              );
            return {
              number: p.num,
              name: p.name,
              position: p.position,
              captain: p.captain,
              goalkeeper: p.goalkeeper,
            };
          });
      });
      teams[side] = t;
    });
    return normalize({ format: FORMAT, version: VERSION, teams: teams });
  }
  function rosterText(list) {
    return list
      .map(function (p) {
        return roster.format({
          num: p.number,
          name: p.name,
          position: p.position,
          captain: p.captain,
          goalkeeper: p.goalkeeper,
        });
      })
      .join('\n');
  }
  function toPatch(value, current) {
    var config = normalize(value),
      patch = {};
    current = current || {};
    ['home', 'away'].forEach(function (side) {
      var t = config.teams[side],
        suffix = side === 'home' ? 'H' : 'A',
        logoKey = side === 'home' ? 'homeLogo' : 'awayLogo';
      patch[side === 'home' ? 'teamHome' : 'teamAway'] = t.name;
      patch[side === 'home' ? 'colorHome' : 'colorAway'] = t.color;
      patch[logoKey] = t.logo.data;
      patch[logoKey + '_filename'] = t.logo.filename;
      ['xi', 'sub'].forEach(function (prefix) {
        patch[prefix + suffix + '_team'] = t.name;
        patch[prefix + suffix + '_color'] = t.color;
        patch[prefix + suffix + '_subtitle'] = prefix === 'xi' ? '首发阵容' : '替补名单';
        patch[prefix + suffix + '_players'] = rosterText(
          t[prefix === 'xi' ? 'starters' : 'substitutes'],
        );
      });
      patch['onfield_' + side] = t.starters.map(function (p) {
        return side + '|' + Number(p.number) + '|' + p.name;
      });
    });
    ['goal', 'card', 'player', 'restart', 'sub'].forEach(function (prefix) {
      var side = current[prefix + '_side'] === 'away' ? 'away' : 'home',
        t = config.teams[side];
      patch[prefix + '_side'] = side;
      patch[prefix + '_team'] = t.name;
      patch[prefix + '_color'] = t.color;
    });
    ['goal', 'card', 'player', 'restart'].forEach(function (prefix) {
      patch[prefix + '_num'] = '';
      patch[prefix + '_name'] = '';
    });
    [
      'sub_off_id',
      'sub_on_id',
      'sub_off_num',
      'sub_on_num',
      'sub_off_name',
      'sub_on_name',
      'player_pos',
      'restart_player',
      'restart_text',
      'card_reason',
    ].forEach(function (key) {
      patch[key] = '';
    });
    return patch;
  }
  function stringify(value) {
    return JSON.stringify(normalize(value), null, 2).replace(/\n/g, '\r\n') + '\r\n';
  }
  function filename(value) {
    var c = normalize(value);
    return (
      '比赛配置-' +
      [c.teams.home.name, c.teams.away.name]
        .map(function (s) {
          return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 40);
        })
        .join('-vs-') +
      '.txt'
    );
  }
  function example() {
    return normalize({
      format: FORMAT,
      version: VERSION,
      teams: {
        home: {
          name: '主队示例',
          color: '#C8102E',
          starters: [
            { number: '1', name: '门将甲', position: 'GK', goalkeeper: true },
            { number: '10', name: '球员甲', position: '中场', captain: true },
          ],
          substitutes: [{ number: '12', name: '球员乙', position: '后卫' }],
        },
        away: {
          name: '客队示例',
          color: '#00529F',
          starters: [
            { number: '1', name: '门将乙', position: 'GK', goalkeeper: true, captain: true },
          ],
          substitutes: [],
        },
      },
    });
  }
  return {
    parse: parse,
    fromState: fromState,
    toPatch: toPatch,
    stringify: stringify,
    filename: filename,
    example: example,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
  };
});
