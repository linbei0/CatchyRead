import { describe, expect, test } from 'vitest';

import { getCollapsedVisibilityModel } from '@/content/playerUiState';

describe('getCollapsedVisibilityModel', () => {
  test('折叠后保留迷你播放条，但隐藏队列与次级操作', () => {
    const model = getCollapsedVisibilityModel(true);

    expect(model.showToolbar).toBe(true);
    expect(model.showTransport).toBe(true);
    expect(model.showQueue).toBe(false);
    expect(model.showSecondaryControls).toBe(false);
    expect(model.collapseButtonLabel).toBe('展开');
  });

  test('展开态显示完整播放器结构', () => {
    const model = getCollapsedVisibilityModel(false);

    expect(model.showToolbar).toBe(true);
    expect(model.showTransport).toBe(true);
    expect(model.showQueue).toBe(true);
    expect(model.showSecondaryControls).toBe(true);
    expect(model.collapseButtonLabel).toBe('折叠');
  });
});
