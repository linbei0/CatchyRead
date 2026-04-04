import { describe, expect, test } from 'vitest';

import { resolveBrowserSpeechAction } from '@/content/browserSpeechState';

describe('resolveBrowserSpeechAction', () => {
  test('只要当前会话已暂停，就优先走 resume', () => {
    expect(resolveBrowserSpeechAction({ hasActiveUtterance: true, isPaused: true })).toBe('resume');
  });

  test('当前会话仍活跃且未暂停时走 pause，没有活跃会话时才 restart', () => {
    expect(resolveBrowserSpeechAction({ hasActiveUtterance: true, isPaused: false })).toBe('pause');
    expect(resolveBrowserSpeechAction({ hasActiveUtterance: false, isPaused: false })).toBe('restart');
  });
});
