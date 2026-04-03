import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RemoteAudioUrlCache } from '@/content/remote-audio-url-cache';

describe('RemoteAudioUrlCache', () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL
      .mockReturnValueOnce('blob:one')
      .mockReturnValueOnce('blob:two')
      .mockReturnValueOnce('blob:three');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('超出上限时按 LRU 回收旧 object URL', () => {
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL
    });

    const cache = new RemoteAudioUrlCache(2);
    cache.set('a', new Blob(['a'], { type: 'audio/mpeg' }));
    cache.set('b', new Blob(['b'], { type: 'audio/mpeg' }));
    cache.get('a');
    cache.set('c', new Blob(['c'], { type: 'audio/mpeg' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:two');
    expect(cache.get('a')).toBe('blob:one');
    expect(cache.get('c')).toBe('blob:three');
  });

  test('clear 会释放所有 object URL', () => {
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL
    });

    const cache = new RemoteAudioUrlCache(2);
    cache.set('a', new Blob(['a'], { type: 'audio/mpeg' }));
    cache.set('b', new Blob(['b'], { type: 'audio/mpeg' }));
    cache.clear();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:one');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:two');
  });
});
