'use strict';

(function (root) {
  const defaults = {
    promotionListX: 96,
    promotionListY: null,
    promotionListWidth: 1136,
    promotionListHeight: 792,
    promotionBackgroundX: 0,
    promotionBackgroundY: 0,
    promotionBackgroundWidth: 1920,
    promotionBackgroundHeight: 1080,
  };

  function listTop(style, design, cardHeight) {
    return style.promotionListY ?? design?.scene.position.y ?? (1080 - cardHeight) / 2;
  }

  function listWidth(style, design, columns) {
    const width = style?.promotionListWidth ?? defaults.promotionListWidth;
    if (design || !columns) return width;
    // Width configured in the inspector is the four-column layout width.
    // Reserve less space when neither of the two text columns is present.
    const base = columns.name || columns.title ? 472 : 232;
    const units = base + (columns.rank ? 124 : 0) + (columns.name ? 216 : 0)
      + (columns.title ? 256 : 0) + (columns.score ? 68 : 0);
    return width * units / 1136;
  }

  function grid(entryCount, style, design, columns) {
    const width = listWidth(style, design, columns);
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
    const header = 96;
    const row = 68;
    const top = 21;
    const bottom = 32;
    const minimumHeight = header + row * 2 + top + bottom;
    const availableWidth = style?.promotionListWidth ?? defaults.promotionListWidth;
    const scale = Math.max(0.001, Math.min(1, availableWidth / 760, height / minimumHeight));
    const headerHeight = header * scale;
    const rowHeight = row * scale;
    const paddingTop = top * scale;
    const paddingBottom = bottom * scale;
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

  const api = { defaults, grid, listTop, listWidth };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StagePromotionLayout = api;
})(globalThis);
