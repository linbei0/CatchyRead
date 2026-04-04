import { describe, expect, test } from 'vitest';

import { shouldIgnoreSpeechSynthesisError } from '@/content/speechSynthesisErrors';

describe('shouldIgnoreSpeechSynthesisError', () => {
  test('主动切段时的 canceled / interrupted 不应显示为错误', () => {
    expect(shouldIgnoreSpeechSynthesisError({ error: 'canceled' })).toBe(true);
    expect(shouldIgnoreSpeechSynthesisError({ error: 'interrupted' })).toBe(true);
  });

  test('真实播放故障仍然要报错', () => {
    expect(shouldIgnoreSpeechSynthesisError({ error: 'audio-hardware' })).toBe(false);
    expect(shouldIgnoreSpeechSynthesisError({ error: 'network' })).toBe(false);
    expect(shouldIgnoreSpeechSynthesisError({})).toBe(false);
  });
});
