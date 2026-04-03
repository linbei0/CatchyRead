import { describe, expect, test } from 'vitest';

import { getApiKeyFieldType } from '@/options/uiState';

describe('getApiKeyFieldType', () => {
  test('未勾选显示时保持 password 类型', () => {
    expect(getApiKeyFieldType(false)).toBe('password');
  });

  test('勾选显示后切换为 text 类型', () => {
    expect(getApiKeyFieldType(true)).toBe('text');
  });
});
