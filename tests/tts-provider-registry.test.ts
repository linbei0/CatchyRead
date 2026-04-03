import { describe, expect, test } from 'vitest';

import { getTtsProviderAdapter, listTtsProviderAdapters } from '@/lib/tts/registry';

describe('tts provider registry', () => {
  test('默认包含 openai-compatible 与 qwen-dashscope', () => {
    const ids = listTtsProviderAdapters().map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining(['openai-compatible-tts', 'qwen-dashscope-tts']));
  });

  test('未知 providerId 会抛出明确错误', () => {
    expect(() => getTtsProviderAdapter('unknown-provider')).toThrow('不支持的 TTS Provider');
  });
});
