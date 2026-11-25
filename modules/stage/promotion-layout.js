'use strict';

(function (root) {
  const defaults = {
    promotionListX: 96,
    promotionListY: 112,
    promotionListWidth: 1728,
    promotionListHeight: 854,
    promotionBackgroundX: 0,
    promotionBackgroundY: 0,
    promotionBackgroundWidth: 1920,
    promotionBackgroundHeight: 1080,
  };

  function grid(entryCount, style, design) {
    const width = style?.promotionListWidth ?? defaults.promotionListWidth;
    const height = style?.promotionListHeight ?? defaults.promotionListHeight;
    if (design) {
      const { top, rowHeight, bottom, gap, minColumnWidth, headings } = design.roster;
      const headingCount = headings ? 1 : 0;
      const minimumHeight = top + rowHeight * (1 + headingCount) + bottom;
      const scale = Math.max(0.001, Math.min(1, width / minColumnWidth, height / minimumHeight));
      const groupLimit = width >= 2 * minColumnWidth + gap ? 2 : 1;
      const rowsPerGroup = Math.max(
        1,
        Math.floor((height / scale - top - bottom) / rowHeight + 1e-8) - headingCount,
      );
      const pageSize = groupLimit * rowsPerGroup;
      return {
        scale,
        headerHeight: top * scale,
        rowHeight: rowHeight * scale,
        paddingTop: 0,
        paddingBottom: bottom * scale,
        rowsPerGroup,
        pageSize,
        pageCount: Math.max(1, Math.ceil(entryCount / pageSize)),
      };
    }
    const scale = Math.max(0.001, Math.min(1, width / 760, height / 230));
    const headerHeight = 112 * scale;
    const rowHeight = 53 * scale;
    const paddingTop = 21 * scale;
    const paddingBottom = 32 * scale;
    const groupLimit = width >= 1280 ? 2 : 1;
    // Reserve one row in every group for the column headings.
    const rowsPerGroup = Math.max(
      1,
      Math.floor((height - headerHeight - paddingTop - paddingBottom) / rowHeight + 1e-8) - 1,
    );
    const pageSize = groupLimit * rowsPerGroup;
    const pageCount = Math.max(1, Math.ceil(entryCount / pageSize));
    return {
      scale,
      headerHeight,
      rowHeight,
      paddingTop,
      paddingBottom,
      rowsPerGroup,
      pageSize,
      pageCount,
    };
  }

  const api = { defaults, grid };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StagePromotionLayout = api;
})(globalThis);
