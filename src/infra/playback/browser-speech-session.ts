import { shouldIgnoreSpeechSynthesisError } from '@/content/speechSynthesisErrors';

export interface BrowserSpeechSessionEvents {
  onEnd: () => void;
  onPause: () => void;
  onResume: () => void;
  onError: (error: unknown) => void;
}

export class BrowserSpeechSession {
  private utterance: SpeechSynthesisUtterance | null = null;
  private paused = false;
  private token = 0;

  constructor(private readonly events: BrowserSpeechSessionEvents) {}

  get hasActiveUtterance(): boolean {
    return Boolean(this.utterance);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  speak(text: string, options: { lang: string; rate: number }): void {
    const utterance = new SpeechSynthesisUtterance(text);
    const token = this.token + 1;
    this.token = token;
    this.utterance = utterance;
    this.paused = false;
    utterance.lang = options.lang;
    utterance.rate = options.rate;
    utterance.onpause = () => {
      if (this.token !== token) {
        return;
      }
      this.paused = true;
      this.events.onPause();
    };
    utterance.onresume = () => {
      if (this.token !== token) {
        return;
      }
      this.paused = false;
      this.events.onResume();
    };
    utterance.onend = () => {
      if (this.token !== token) {
        return;
      }
      this.utterance = null;
      this.paused = false;
      this.events.onEnd();
    };
    utterance.onerror = (event) => {
      if (this.token !== token) {
        return;
      }
      if (shouldIgnoreSpeechSynthesisError(event)) {
        return;
      }
      this.utterance = null;
      this.paused = false;
      this.events.onError(new Error('浏览器语音播放失败。'));
    };

    speechSynthesis.cancel();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    speechSynthesis.speak(utterance);
  }

  pause(): void {
    speechSynthesis.pause();
    this.paused = true;
  }

  resume(): void {
    speechSynthesis.resume();
    this.paused = false;
  }

  stop(): void {
    this.token += 1;
    this.utterance = null;
    this.paused = false;
    speechSynthesis.cancel();
  }
}
