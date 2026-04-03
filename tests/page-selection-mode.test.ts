import { describe, expect, test } from 'vitest';

import { shouldHandlePageSelection } from '@/content/page-selection-mode';

describe('shouldHandlePageSelection', () => {
  test('未开启定位模式时，不响应页面正文点击跳转', () => {
    expect(
      shouldHandlePageSelection({
        isOpen: true,
        selectionMode: false,
        clickedInsidePlayer: false,
        hasBlockTarget: true
      })
    ).toBe(false);
  });

  test('开启定位模式后，点击正文块才会接管交互', () => {
    expect(
      shouldHandlePageSelection({
        isOpen: true,
        selectionMode: true,
        clickedInsidePlayer: false,
        hasBlockTarget: true
      })
    ).toBe(true);
  });
});
