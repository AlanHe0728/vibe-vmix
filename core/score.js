'use strict';

function normalize(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function adjust(current, delta) {
  const amount = Number(delta);
  if (!Number.isSafeInteger(amount)) throw Error('invalid score delta');
  const next = normalize(current) + amount;
  if (!Number.isSafeInteger(next)) throw Error('score exceeds safe integer range');
  return Math.max(0, next);
}

module.exports = { normalize, adjust };
