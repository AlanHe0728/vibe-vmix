'use strict';

const { keys, text } = require('./show');
const presets = [
  ['champion', '冠军'],
  ['runner-up', '亚军'],
  ['third', '季军'],
  ['popular', '最佳人气歌手'],
  ['teacher-1', '诗韵深秋奖'],
  ['teacher-2', '诗韵深秋奖'],
];

function defaultAwards() {
  return presets.map(([awardId, title]) => ({ awardId, title, recipient: '', holdSeconds: 10 }));
}

function normalizeAward(value, title) {
  keys(value, ['awardId', 'title', 'recipient', 'holdSeconds']);
  if (value.title !== title) throw Error('奖项名称无效');
  const { awardId, holdSeconds } = value;
  if (!Number.isFinite(holdSeconds) || holdSeconds < 0.1 || holdSeconds > 3600)
    throw Error('中间展示时长须在 0.1 到 3600 秒之间');
  return { awardId, title, recipient: text(value.recipient, 40), holdSeconds };
}

function normalizeAwards(rows) {
  if (!Array.isArray(rows) || rows.length !== presets.length) throw Error('请保留六个颁奖席位');
  return presets.map(([awardId, title]) => {
    const row = rows.find((item) => item?.awardId === awardId);
    if (!row) throw Error('找不到对应的颁奖席位');
    return normalizeAward(row, title);
  });
}

function exitTime(cue) {
  return cue.exitAt || cue.startedAt + 3200 + cue.holdSeconds * 1000;
}

function takeAward(state, payload, now) {
  keys(payload, ['awardId', 'recipient', 'holdSeconds']);
  if (state.awardOnAir && now < exitTime(state.awardOnAir) + 800)
    throw Error('请等当前颁奖退场后再播出');
  const slot = state.awards.find(({ awardId }) => awardId === payload.awardId);
  if (!slot) throw Error('请选择有效的奖项');
  const saved = normalizeAward({ ...slot, ...payload }, slot.title);
  if (!saved.recipient) throw Error('请填写获奖人姓名');
  return {
    ...state,
    awards: state.awards.map((award) => (award === slot ? saved : award)),
    awardOnAir: { ...saved, startedAt: now, exitAt: 0 },
  };
}

function hideAward(state, payload, now) {
  keys(payload, []);
  const cue = state.awardOnAir;
  if (!cue || now >= exitTime(cue)) return state;
  return { ...state, awardOnAir: { ...cue, exitAt: now } };
}

function advanceAward(state, now) {
  return state.awardOnAir && now >= exitTime(state.awardOnAir) + 800
    ? { ...state, awardOnAir: null }
    : null;
}

module.exports = { defaultAwards, normalizeAwards, takeAward, hideAward, advanceAward };
