import { beforeEach, describe, expect, test, vi } from 'vitest';

import { BrowserSpeechSession } from '@/infra/playback/browser-speech-session';

class FakeSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('BrowserSpeechSession', () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  const pause = vi.fn();
  const resume = vi.fn();

  beforeEach(() => {
    speak.mockReset();
    cancel.mockReset();
    pause.mockReset();
    resume.mockReset();

    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel,
      pause,
      resume,
      paused: false
    });
  });

  test('播放中修改倍速时，立即按新倍速重启当前朗读', () => {
    const session = new BrowserSpeechSession({
      onEnd: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onError: vi.fn()
    });

    session.speak('当前段落', {
      lang: 'zh-CN',
      rate: 1
    });
    session.updateRate(1.5);

    expect(speak).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[0][0]).toMatchObject({
      text: '当前段落',
      lang: 'zh-CN',
      rate: 1
    });
    expect(speak.mock.calls[1][0]).toMatchObject({
      text: '当前段落',
      lang: 'zh-CN',
      rate: 1.5
    });
  });
});
