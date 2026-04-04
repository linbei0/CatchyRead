import type { AppSettings, RemoteAudioPayload, RewriteRequestPayload, SmartScriptSegment, UiPreferences } from '@/shared/types';
import type { RuntimeMessage } from '@/shared/messages';

type MessageSender = <TResult = unknown>(message: RuntimeMessage) => Promise<TResult>;

export interface ContentMessageGateway {
  loadSettings(): Promise<AppSettings>;
  saveUiState(partial: Partial<UiPreferences>): Promise<void>;
  openOptions(): Promise<void>;
  rewrite(payload: RewriteRequestPayload): Promise<SmartScriptSegment[]>;
  cancelRewrite(requestId: string): Promise<void>;
  synthesizeRemote(text: string, rate: number, voiceId?: string): Promise<RemoteAudioPayload>;
}

export class BrowserContentMessageGateway implements ContentMessageGateway {
  constructor(private readonly sendMessage: MessageSender) {}

  async loadSettings(): Promise<AppSettings> {
    const result = await this.sendMessage<{ settings: AppSettings }>({ type: 'catchyread/get-settings' });
    return result.settings;
  }

  async saveUiState(partial: Partial<UiPreferences>): Promise<void> {
    await this.sendMessage({ type: 'catchyread/save-ui-state', payload: partial });
  }

  async openOptions(): Promise<void> {
    await this.sendMessage({ type: 'catchyread/open-options' });
  }

  async rewrite(payload: RewriteRequestPayload): Promise<SmartScriptSegment[]> {
    const result = await this.sendMessage<{ segments: SmartScriptSegment[] }>({
      type: 'catchyread/rewrite',
      payload
    });
    return result.segments;
  }

  async cancelRewrite(requestId: string): Promise<void> {
    await this.sendMessage({
      type: 'catchyread/cancel-rewrite',
      payload: { requestId }
    });
  }

  async synthesizeRemote(text: string, rate: number, voiceId?: string): Promise<RemoteAudioPayload> {
    const result = await this.sendMessage<{ audio: RemoteAudioPayload }>({
      type: 'catchyread/synthesize-remote',
      payload: { text, rate, voiceId }
    });
    return result.audio;
  }
}
