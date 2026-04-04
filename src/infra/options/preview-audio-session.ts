import type { RemoteAudioPayload } from '@/shared/types';

export class PreviewAudioSession {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  release(): void {
    this.audio?.pause();
    this.audio = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private payloadToPlayableUrl(payload: RemoteAudioPayload): string {
    if (payload.mediaUrl) {
      return payload.mediaUrl;
    }
    if (!payload.base64Audio) {
      throw new Error('试听音频为空。');
    }
    const binary = atob(payload.base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    this.objectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: payload.mimeType || 'audio/mpeg' }));
    return this.objectUrl;
  }

  async play(payload: RemoteAudioPayload): Promise<void> {
    this.release();
    const url = this.payloadToPlayableUrl(payload);
    this.audio = new Audio(url);
    await this.audio.play();
  }
}
