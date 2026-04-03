import { describe, expect, test } from 'vitest';

import { detectPlaybackCapabilities } from '@/content/capabilities';

describe('detectPlaybackCapabilities', () => {
  test('能识别浏览器语音、指针事件与远端音频能力', () => {
    const capabilities = detectPlaybackCapabilities({
      hasSpeechSynthesis: true,
      hasSpeechSynthesisUtterance: true,
      hasPointerEvent: true,
      hasAudioElement: true
    });

    expect(capabilities.browserTtsAvailable).toBe(true);
    expect(capabilities.pointerEventsSupported).toBe(true);
    expect(capabilities.remoteAudioPlaybackLikelyAvailable).toBe(true);
  });

  test('缺少语音或指针能力时返回 false', () => {
    const capabilities = detectPlaybackCapabilities({
      hasSpeechSynthesis: false,
      hasSpeechSynthesisUtterance: false,
      hasPointerEvent: false,
      hasAudioElement: true
    });

    expect(capabilities.browserTtsAvailable).toBe(false);
    expect(capabilities.pointerEventsSupported).toBe(false);
  });
});
