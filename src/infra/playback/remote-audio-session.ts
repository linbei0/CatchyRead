export interface RemoteAudioSessionEvents {
  onEnded: () => void;
  onPlay: () => void;
  onPause: () => void;
  onMetadata: (durationSeconds?: number) => void;
  onTimeUpdate: (currentTimeSeconds: number, durationSeconds?: number) => void;
  onError: (error: unknown) => void;
}

export class RemoteAudioSession {
  private readonly audio = new Audio();

  constructor(private readonly events: RemoteAudioSessionEvents) {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.events.onEnded());
    this.audio.addEventListener('play', () => this.events.onPlay());
    this.audio.addEventListener('pause', () => {
      if (this.audio.ended) {
        return;
      }
      this.events.onPause();
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this.events.onMetadata(Number.isFinite(this.audio.duration) ? this.audio.duration : undefined);
    });
    this.audio.addEventListener('timeupdate', () => {
      this.events.onTimeUpdate(
        this.audio.currentTime,
        Number.isFinite(this.audio.duration) ? this.audio.duration : undefined
      );
    });
    this.audio.addEventListener('error', () => this.events.onError(new Error('远端音频播放失败，请检查音频格式或 TTS 设置。')));
  }

  get hasSource(): boolean {
    return Boolean(this.audio.src);
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  async play(url: string, rate: number): Promise<void> {
    this.audio.src = url;
    this.audio.playbackRate = rate;
    await this.audio.play();
  }

  async resume(): Promise<void> {
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  setRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
