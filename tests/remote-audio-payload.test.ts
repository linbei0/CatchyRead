import { describe, expect, test } from 'vitest';

import { normalizeRemoteMediaUrl } from '@/lib/tts/media-url';

describe('normalizeRemoteMediaUrl', () => {
  test('阿里云返回 http 音频地址时自动升级到 https', () => {
    expect(normalizeRemoteMediaUrl('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo.wav')).toBe(
      'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo.wav'
    );
  });

  test('其他 https 地址保持不变', () => {
    expect(normalizeRemoteMediaUrl('https://example.com/demo.mp3')).toBe('https://example.com/demo.mp3');
  });
});
