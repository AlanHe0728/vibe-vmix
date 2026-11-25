'use strict';
const { assertObject } = require('../../core/state-store');
const allowed = ['inspect', 'setControl', 'frame', 'renderClip', 'seek', 'markers'];
function validateCommand(input, snapshot) {
  assertObject(input);
  if (!allowed.includes(input.type)) throw Error('不支持此 AE 操作');
  const args = { ...(input.args || {}) };
  assertObject(args);
  if (input.type !== 'inspect') {
    if (!Number.isInteger(args.compId) || args.compId !== snapshot?.comp?.id)
      throw Error('AE 合成已改变，请重新读取合成');
  }
  if (input.type === 'setControl') {
    const control = snapshot.controls?.find((item) => item.id === args.id);
    if (!control) throw Error('此直播控件不存在，请刷新合成');
    if (control.kind === 'text') {
      if (typeof args.value !== 'string' || args.value.length > 2000) throw Error('文字过长');
    } else if (control.kind === 'color') {
      if (
        !Array.isArray(args.value) ||
        args.value.length !== 3 ||
        args.value.some((value) => typeof value !== 'number' || value < 0 || value > 1)
      )
        throw Error('颜色无效');
    } else if (
      typeof args.value !== 'number' ||
      !Number.isFinite(args.value) ||
      Math.abs(args.value) > 1000000
    )
      throw Error('数值无效');
    // Use the path inspected from AE; never accept an arbitrary property path.
    args.control = { ...control };
    delete args.id;
  }
  if (
    input.type === 'seek' &&
    (typeof args.seconds !== 'number' ||
      !Number.isFinite(args.seconds) ||
      args.seconds < 0 ||
      args.seconds >= snapshot.comp.duration)
  )
    throw Error('播放位置超出合成时长');
  if (
    input.type === 'renderClip' &&
    (typeof args.outputModule !== 'string' ||
      !args.outputModule.trim() ||
      args.outputModule.length > 200)
  )
    throw Error('请填写 AE 输出模块模板');
  if (input.type === 'frame') {
    if (
      args.seconds !== undefined &&
      (typeof args.seconds !== 'number' ||
        args.seconds < 0 ||
        args.seconds >= snapshot.comp.duration)
    )
      throw Error('画面时间超出范围');
    if (![1, 2, 4].includes(args.resolution || 1)) throw Error('预览质量无效');
  }
  return { type: input.type, args };
}
module.exports = { validateCommand };
