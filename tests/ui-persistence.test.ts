import { describe, expect, test } from 'vitest';

import { mergeUiPreferences } from '@/lib/storage/ui-preferences';
import type { UiPreferences } from '@/lib/shared/types';

describe('mergeUiPreferences', () => {
  test('仅更新传入字段，不覆盖其他 UI 状态', () => {
    const current: UiPreferences = {
      collapsed: false,
      x: 120,
      y: 220
    };

    expect(
      mergeUiPreferences(current, {
        collapsed: true
      })
    ).toEqual({
      collapsed: true,
      x: 120,
      y: 220
    });
  });
});
