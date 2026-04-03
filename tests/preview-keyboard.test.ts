import { describe, expect, test } from 'vitest';

import { resolvePreviewKeyboardAction } from '@/content/preview-keyboard';

describe('resolvePreviewKeyboardAction', () => {
  test('ArrowDown 移动到下一项', () => {
    expect(resolvePreviewKeyboardAction('ArrowDown', 1, 4)).toEqual({
      nextIndex: 2,
      handled: true,
      activate: false
    });
  });

  test('Enter 激活当前项', () => {
    expect(resolvePreviewKeyboardAction('Enter', 1, 4)).toEqual({
      nextIndex: 1,
      handled: true,
      activate: true
    });
  });

  test('无关按键不处理', () => {
    expect(resolvePreviewKeyboardAction('KeyA', 1, 4)).toEqual({
      nextIndex: 1,
      handled: false,
      activate: false
    });
  });
});
