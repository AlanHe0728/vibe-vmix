/* One saved substitution event, containing 1–11 disjoint exchanges. */
(function () {
  'use strict';
  var latest = null,
    rows = [],
    busy = false,
    loaded = false;
  function el(id) {
    return document.getElementById(id);
  }
  function error(message) {
    el('subBatchError').textContent = message || '';
  }
  function getState() {
    return fetch(serverBase + '/state.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw Error('无法读取场内名单');
      return r.json();
    });
  }
  function players(s, side) {
    var suffix = side === 'away' ? 'A' : 'H',
      seen = {},
      result = [];
    ['xi', 'sub'].forEach(function (prefix) {
      String(s[prefix + suffix + '_players'] || '')
        .split(/\r?\n/)
        .forEach(function (line) {
          var p = FBPRosterFormat.line(line);
          if (!p) return;
          var id = side + '|' + Number(p.num) + '|' + p.name;
          if (!seen[id]) {
            seen[id] = true;
            result.push({ id: id, num: p.num, name: p.name, starting: prefix === 'xi' });
          }
        });
    });
    return result;
  }
  function active(s, side, list) {
    return Array.isArray(s['onfield_' + side])
      ? s['onfield_' + side]
      : list
          .filter(function (p) {
            return p.starting;
          })
          .map(function (p) {
            return p.id;
          });
  }
  function populate() {
    if (!latest) return;
    var side = el('sub_side').value,
      list = players(latest, side),
      onfield = active(latest, side, list);
    rows.forEach(function (row) {
      ['off', 'on'].forEach(function (dir) {
        var select = row[dir],
          value = select.value;
        select.replaceChildren(new Option(dir === 'off' ? '选择场内球员' : '选择场外球员', ''));
        list
          .filter(function (p) {
            return onfield.includes(p.id) === (dir === 'off');
          })
          .forEach(function (p) {
            select.add(new Option(p.num + ' · ' + p.name, p.id));
          });
        select.value = value;
      });
    });
    el('addSubPair').disabled = rows.length >= 10 || busy;
  }
  function add(pair) {
    if (rows.length >= 10) return;
    var root = document.createElement('div');
    root.className = 'sub-batch-pair';
    var row = { root: root };
    ['off', 'on'].forEach(function (dir) {
      var field = document.createElement('div');
      field.className = 'field';
      var label = document.createElement('label');
      label.textContent = dir === 'off' ? '下场球员 · 场内' : '上场球员 · 场外';
      var select = document.createElement('select');
      select.id = 'batch-' + dir + '-' + Date.now() + '-' + rows.length;
      label.htmlFor = select.id;
      select.onchange = function () {
        error('');
      };
      row[dir] = select;
      field.append(label, select);
      root.appendChild(field);
    });
    var remove = document.createElement('button');
    remove.className = 'btn';
    remove.type = 'button';
    remove.textContent = '删除';
    remove.onclick = function () {
      rows = rows.filter(function (r) {
        return r !== row;
      });
      root.remove();
      populate();
    };
    root.appendChild(remove);
    rows.push(row);
    el('subBatchRows').appendChild(root);
    populate();
    if (pair) {
      row.off.value = pair.off_id;
      row.on.value = pair.on_id;
    }
  }
  function patch(s) {
    var side = el('sub_side').value,
      list = players(s, side),
      onfield = active(s, side, list),
      pairs = [{ off: el('sub_off_player'), on: el('sub_on_player') }].concat(rows),
      used = new Set();
    var batch = pairs.map(function (row, index) {
      var off = list.find(function (p) {
          return p.id === row.off.value;
        }),
        incoming = list.find(function (p) {
          return p.id === row.on.value;
        });
      if (!off || !incoming || !onfield.includes(off.id) || onfield.includes(incoming.id))
        throw Error('第 ' + (index + 1) + ' 组请选择场内下场球员与场外上场球员');
      if (used.has(off.id) || used.has(incoming.id))
        throw Error('同一球员不能重复出现在换人列表中');
      used.add(off.id);
      used.add(incoming.id);
      return {
        off_id: off.id,
        on_id: incoming.id,
        off_num: off.num,
        off_name: off.name,
        on_num: incoming.num,
        on_name: incoming.name,
      };
    });
    var first = batch[0];
    return {
      sub_side: side,
      sub_batch: batch,
      sub_off_id: first.off_id,
      sub_on_id: first.on_id,
      sub_off_num: first.off_num,
      sub_off_name: first.off_name,
      sub_on_num: first.on_num,
      sub_on_name: first.on_name,
      sub_team: s[side === 'away' ? 'teamAway' : 'teamHome'] || '球队',
      sub_color: s[side === 'away' ? 'colorAway' : 'colorHome'] || '#37003c',
    };
  }
  function run(mode) {
    if (busy) return Promise.resolve(null);
    busy = true;
    error('');
    var buttons = el('event-sub').querySelectorAll('button');
    buttons.forEach(function (b) {
      b.disabled = true;
    });
    return sendState(function () {
      return getState().then(function (s) {
        latest = s;
        if (mode === 'execute') return { sub_trigger: 'show', sub_tick: nTick() };
        var p = patch(s);
        if (mode === 'save-execute') {
          p.sub_trigger = 'show';
          p.sub_tick = nTick();
        }
        return p;
      });
    })
      .then(function (result) {
        if (!result) error(el('writeStatus').textContent);
        else {
          if (result.onfield) {
            latest.onfield_home = result.onfield.home;
            latest.onfield_away = result.onfield.away;
          }
          log(mode === 'save' ? '换人已保存' : '换人已执行', true);
        }
        return result;
      })
      .finally(function () {
        busy = false;
        buttons.forEach(function (b) {
          b.disabled = false;
        });
        populate();
      });
  }
  function hydrate(s) {
    latest = s;
    if (!loaded) {
      loaded = true;
      if (s.sub_side === 'home' || s.sub_side === 'away') el('sub_side').value = s.sub_side;
      if (Array.isArray(s.sub_batch)) s.sub_batch.slice(1).forEach(add);
    }
    populate();
  }
  function refresh() {
    return getState()
      .then(function (s) {
        hydrate(s);
      })
      .catch(function (e) {
        error(e.message);
      });
  }
  el('addSubPair').onclick = function () {
    add();
  };
  el('sub_side').addEventListener('change', function () {
    rows.forEach(function (r) {
      r.root.remove();
    });
    rows = [];
    error('');
    refresh();
  });
  el('task-sub').addEventListener('click', function () {
    refresh();
  });
  window.FBPBatchSub = { run: run, refresh: refresh, hydrate: hydrate, add: add };
  var clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn';
  clear.textContent = '清空';
  clear.onclick = function () {
    ['off', 'on'].forEach(function (dir) {
      el('sub_' + dir + '_player').value = '';
      el('sub_' + dir + '_player').dispatchEvent(new Event('change'));
    });
    error('');
  };
  el('sub_off_player').closest('.frow').appendChild(clear);
  refresh();
})();
