import browser from 'webextension-polyfill';

import type {
  AppSettings,
  RemoteAudioPayload,
  RewriteRequestPayload,
  SmartScriptSegment,
  UiPreferences
} from '@/shared/types';
import type { RuntimeMessage } from '@/shared/messages';
import { SETTINGS_STORAGE_KEY } from '@/lib/storage/settings';

type MessageSender = <TResult = unknown>(message: RuntimeMessage) => Promise<TResult>;

interface StorageChangeEventApi {
  onChanged: {
    addListener(callback: (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => void): void;
    removeListener(callback: (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => void): void;
  };
}

export interface ContentMessageGateway {
  loadSettings(): Promise<AppSettings>;
  saveUiState(partial: Partial<UiPreferences>): Promise<void>;
  openOptions(): Promise<void>;
  rewrite(payload: RewriteRequestPayload): Promise<SmartScriptSegment[]>;
  cancelRewrite(requestId: string): Promise<void>;
  synthesizeRemote(text: string, rate: number, voiceId?: string): Promise<RemoteAudioPayload>;
  observeSettings(callback: (settings: AppSettings) => void | Promise<void>): () => void;
}

export class BrowserContentMessageGateway implements ContentMessageGateway {
  constructor(
    private readonly sendMessage: MessageSender,
    private readonly storageApi: StorageChangeEventApi = browser.storage
  ) {}

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

  observeSettings(callback: (settings: AppSettings) => void | Promise<void>): () => void {
    const listener = async (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
        return;
      }
      callback(await this.loadSettings());
    };

    this.storageApi.onChanged.addListener(listener);
    return () => {
      this.storageApi.onChanged.removeListener(listener);
    };
  }
}
