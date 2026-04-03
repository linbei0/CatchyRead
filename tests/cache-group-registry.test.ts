import { describe, expect, test, vi } from 'vitest';

import { RuntimeCacheRegistry } from '@/lib/cache/runtime-cache-registry';

describe('RuntimeCacheRegistry', () => {
  test('可以按组清理指定缓存', () => {
    const clearAudio = vi.fn();
    const clearSnapshot = vi.fn();

    const registry = new RuntimeCacheRegistry();
    registry.register('audio', clearAudio);
    registry.register('snapshot', clearSnapshot);
    registry.clearGroup('audio');

    expect(clearAudio).toHaveBeenCalledTimes(1);
    expect(clearSnapshot).not.toHaveBeenCalled();
  });

  test('可以一键清理所有缓存组', () => {
    const clearAudio = vi.fn();
    const clearSnapshot = vi.fn();

    const registry = new RuntimeCacheRegistry();
    registry.register('audio', clearAudio);
    registry.register('snapshot', clearSnapshot);
    registry.clearAll();

    expect(clearAudio).toHaveBeenCalledTimes(1);
    expect(clearSnapshot).toHaveBeenCalledTimes(1);
  });
});
