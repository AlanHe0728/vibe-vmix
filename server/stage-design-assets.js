'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { AppError } = require('../core/errors');
const { mediaPrefix, mediaName } = require('../modules/stage/design');

function format(element) {
  return element.type === 'video'
    ? { extension: 'webm', mime: 'video/webm' }
    : { extension: 'png', mime: 'image/png' };
}

function createStageDesignAssets(directory) {
  function map(design, convert) {
    return {
      ...design,
      elements: design.elements.map((element) =>
        element.src ? { ...element, src: convert(element) } : element,
      ),
    };
  }
  return {
    import(design) {
      return map(design, (element) => {
        const { extension } = format(element);
        const data = Buffer.from(element.src.slice(element.src.indexOf(',') + 1), 'base64');
        const name = createHash('sha256').update(data).digest('hex') + '.' + extension;
        fs.mkdirSync(directory, { recursive: true });
        const target = path.join(directory, name);
        if (!fs.existsSync(target)) {
          const temporary = target + '.' + randomUUID() + '.tmp';
          try {
            fs.writeFileSync(temporary, data, { flag: 'wx' });
            fs.renameSync(temporary, target);
          } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
          }
        }
        return mediaPrefix + name;
      });
    },
    export(design, position) {
      const { revision, ...portable } = map(design, (element) => {
        const name = element.src.slice(mediaPrefix.length);
        if (!mediaName.test(name)) throw new AppError('模板素材地址无效', 409);
        const target = path.join(directory, name);
        if (!fs.existsSync(target)) throw new AppError('模板素材丢失：' + name, 409);
        const { mime } = format(element);
        return 'data:' + mime + ';base64,' + fs.readFileSync(target).toString('base64');
      });
      if (position) portable.scene = { ...portable.scene, position };
      return portable;
    },
  };
}

module.exports = { createStageDesignAssets };
