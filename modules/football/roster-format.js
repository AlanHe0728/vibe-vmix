/* Shared number/name recognition for the panel, titles and Node server. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBPRosterFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function digits(value) {
    return String(value == null ? '' : value)
      .replace(/[０-９]/g, function (c) {
        return String(c.charCodeAt(0) - 65296);
      })
      .replace(/^\uFEFF/, '')
      .trim();
  }
  function number(value) {
    var m = digits(value).match(/^(?:#\s*|no\.?\s*|号码\s*[:：]?\s*)?(\d{1,3})\s*号?$/i);
    return m ? m[1] : null;
  }
  var positions =
    /^(GK|DF|MF|FW|ST|CF|LW|RW|AM|CAM|CM|CDM|DM|LM|RM|CB|LB|RB|LWB|RWB|前锋|中锋|边锋|中场|前腰|后腰|边前卫|后卫|中后卫|边后卫|左后卫|右后卫|自由人)$/i;
  function metadata(value) {
    var tag = String(value).trim(),
      custom = tag.match(/^位置\s*[:：]\s*(.+)$/i);
    if (custom) tag = custom[1].trim();
    if (/^(c|captain|队长)$/i.test(tag)) return { captain: true };
    if (/^(gk|goalkeeper|门将|守门员)$/i.test(tag)) return { goalkeeper: true, position: 'GK' };
    if (positions.test(tag)) return { position: /^[a-z]+$/i.test(tag) ? tag.toUpperCase() : tag };
    if (custom) return { position: tag };
    return null;
  }
  function named(num, name) {
    name = String(name == null ? '' : name).trim();
    var clean = name,
      captain = false,
      goalkeeper = false,
      position = '';
    while (clean) {
      var star = clean.match(/\s*[*#]+\s*$/);
      if (star) {
        captain = true;
        clean = clean.slice(0, star.index).trim();
        continue;
      }
      var mark = clean.match(/\s*[（(\[【]([^()（）\[\]【】]+)[）)\]】]\s*$/),
        info = mark && metadata(mark[1]);
      if (!info) {
        mark = clean.match(/\s+(GK|goalkeeper|门将|守门员|队长)\s*$/i);
        info = mark && metadata(mark[1]);
      }
      if (!info) break;
      captain = captain || !!info.captain;
      goalkeeper = goalkeeper || !!info.goalkeeper;
      if (info.position && (!position || position === 'GK')) position = info.position;
      clean = clean.slice(0, mark.index).trim();
    }
    if (!clean || !/[A-Za-z\u00c0-\uffff]/.test(clean) || /^[\d\s+\-:：,，;；.．、|/]/.test(clean))
      return null;
    return {
      num: num,
      name: clean,
      displayName: name,
      captain: captain,
      goalkeeper: goalkeeper,
      position: position,
    };
  }
  function format(player) {
    var pos = String(player.position || '').trim(),
      parts = [player.num + ' ' + player.name];
    if (pos && pos !== 'GK')
      parts.push(positions.test(pos) ? '(' + pos + ')' : '[位置:' + pos + ']');
    if (player.goalkeeper || pos === 'GK') parts.push('(GK)');
    if (player.captain) parts.push('(C)');
    return parts.join(' ');
  }
  function line(value) {
    var m = digits(value).match(/^(?:#\s*|no\.?\s*|号码\s*[:：]?\s*)?(\d{1,3})(?!\d)([^\r\n]*)$/i);
    if (!m) return null;
    var name = m[2]
      .trim()
      .replace(/^号(?:球员)?/, '')
      .replace(/^[\s+＋\-－—–:：,，;；.．、·|/]+/, '');
    return named(m[1], name);
  }
  function cells(text) {
    var result = [],
      cell = '',
      quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if ((c === ',' || c === '，' || c === '\t' || c === ';' || c === '；') && !quoted) {
        result.push(cell.trim());
        cell = '';
      } else cell += c;
    }
    result.push(cell.trim());
    return result;
  }
  function heading(value) {
    return digits(value)
      .toLowerCase()
      .replace(/[\s_.()（）:：]/g, '');
  }
  var numberHeading =
    /^(号码|球衣号码|球员号码|球衣号|背号|球号|号|no|number|jersey|jerseynumber|shirtnumber)$/;
  var nameHeading = /^(姓名|名字|球员|球员姓名|球员名字|队员姓名|name|player|playername|fullname)$/;
  var positionHeading = /^(位置|场上位置|球员位置|position|pos|role)$/;
  var captainHeading = /^(队长|captain|c)$/;
  var goalkeeperHeading = /^(门将|守门员|goalkeeper|gk)$/;
  function marked(value) {
    return /^(1|true|yes|y|是|√|✓|c|captain|队长|gk|goalkeeper|门将|守门员)$/i.test(
      String(value || '').trim(),
    );
  }
  function rows(data) {
    var result = [],
      seen = {},
      columns = null,
      skipped = 0;
    data.forEach(function (row) {
      row = row.map(function (v) {
        return String(v == null ? '' : v).trim();
      });
      if (!row.some(Boolean)) return;
      var n = row.findIndex(function (v) {
          return numberHeading.test(heading(v));
        }),
        p = row.findIndex(function (v) {
          return nameHeading.test(heading(v));
        });
      if (n >= 0 && p >= 0) {
        columns = {
          num: n,
          name: p,
          position: row.findIndex(function (v) {
            return positionHeading.test(heading(v));
          }),
          captain: row.findIndex(function (v) {
            return captainHeading.test(heading(v));
          }),
          goalkeeper: row.findIndex(function (v) {
            return goalkeeperHeading.test(heading(v));
          }),
        };
        return;
      }
      var player = null;
      if (columns) {
        var num = number(row[columns.num]);
        if (num !== null) player = named(num, row[columns.name]);
      } else {
        for (var i = 0; i + 1 < row.length && !player; i++) {
          var num = number(row[i]);
          if (num !== null) player = named(num, row[i + 1]);
        }
        if (!player) for (var i = 0; i < row.length && !player; i++) player = line(row[i]);
      }
      if (!player) {
        skipped++;
        return;
      }
      var withMetadata =
        columns && (columns.position >= 0 || columns.captain >= 0 || columns.goalkeeper >= 0);
      if (withMetadata) {
        var pos = columns.position >= 0 ? row[columns.position] : '',
          info = pos && metadata(pos);
        if (pos && (!info || info.position)) player.position = (info && info.position) || pos;
        player.goalkeeper =
          player.goalkeeper ||
          !!(info && info.goalkeeper) ||
          (columns.goalkeeper >= 0 && marked(row[columns.goalkeeper]));
        player.captain =
          player.captain ||
          !!(info && info.captain) ||
          (columns.captain >= 0 && marked(row[columns.captain]));
      }
      var id = Number(player.num) + '|' + player.name;
      if (seen[id]) return;
      seen[id] = true;
      result.push(withMetadata ? format(player) : player.num + ' ' + player.displayName);
    });
    return { text: result.join('\n'), count: result.length, skipped: skipped };
  }
  function text(value) {
    return rows(
      String(value)
        .replace(/^\uFEFF/, '')
        .split(/\r\n|\n|\r/)
        .map(cells),
    );
  }
  return { line: line, number: number, rows: rows, text: text, format: format };
});
