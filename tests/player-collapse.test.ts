import { describe, expect, test } from 'vitest';

import { getCollapsedVisibilityModel } from '@/content/playerUiState';

describe('getCollapsedVisibilityModel', () => {
  test('折叠后仍然保留标题栏操作区，允许恢复展开', () => {
    const model = getCollapsedVisibilityModel(true);

    expect(model.showToolbar).toBe(true);
    expect(model.showContentControls).toBe(false);
    expect(model.collapseButtonLabel).toBe('展开');
  });

  test('展开态显示完整控制区，按钮文案为折叠', () => {
    const model = getCollapsedVisibilityModel(false);

    expect(model.showToolbar).toBe(true);
    expect(model.showContentControls).toBe(true);
    expect(model.collapseButtonLabel).toBe('折叠');
  });
});
