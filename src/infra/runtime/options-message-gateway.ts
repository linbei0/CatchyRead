import type { AppSettings, ProviderTestResult, RemoteAudioPayload } from '@/shared/types';
import type { ProviderTestMessageResult, RuntimeMessage, TtsPreviewMessageResult } from '@/shared/messages';

type MessageSender = <TResult = unknown>(message: RuntimeMessage) => Promise<TResult>;

export class OptionsMessageGateway {
  constructor(private readonly sendMessage: MessageSender) {}

  async loadSettings(): Promise<AppSettings> {
    const result = await this.sendMessage<{ settings: AppSettings }>({ type: 'catchyread/get-settings' });
    return result.settings;
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const result = await this.sendMessage<{ settings: AppSettings }>({
      type: 'catchyread/save-settings',
      payload: settings
    });
    return result.settings;
  }

  async testProvider(providerKind: 'llm' | 'tts'): Promise<ProviderTestResult> {
    return this.sendMessage<ProviderTestMessageResult>({
      type: 'catchyread/test-provider',
      payload: { providerKind }
    });
  }

  async previewSample(text: string): Promise<RemoteAudioPayload> {
    const result = await this.sendMessage<TtsPreviewMessageResult>({
      type: 'catchyread/preview-tts-sample',
      payload: { text }
    });
    return result.audio;
  }
}
