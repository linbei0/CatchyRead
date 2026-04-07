import type {
  AppSettings,
  ProviderConfig,
  ProviderTestResult,
  RemoteAudioPayload,
  RewriteRequestPayload,
  SitePlaybackPreferences,
  UiPreferences
} from '@/shared/types';

export type RuntimeMessage =
  | { type: 'catchyread/toggle-player' }
  | { type: 'catchyread/open-options' }
  | { type: 'catchyread/get-settings' }
  | { type: 'catchyread/save-settings'; payload: AppSettings }
  | { type: 'catchyread/save-ui-state'; payload: Partial<UiPreferences> }
  | {
      type: 'catchyread/get-site-playback-preferences';
      payload: {
        url: string;
      };
    }
  | {
      type: 'catchyread/save-site-playback-preferences';
      payload: {
        url: string;
        playback: SitePlaybackPreferences;
      };
    }
  | {
      type: 'catchyread/test-provider';
      payload: {
        providerKind: 'llm' | 'tts';
      };
    }
  | {
      type: 'catchyread/preview-tts-sample';
      payload: {
        text: string;
      };
    }
  | {
      type: 'catchyread/rewrite';
      payload: RewriteRequestPayload;
    }
  | {
      type: 'catchyread/cancel-rewrite';
      payload: {
        requestId: string;
      };
    }
  | {
      type: 'catchyread/synthesize-remote';
      payload: {
        text: string;
        rate: number;
        voiceId?: string;
      };
    };

export interface ProviderTestMessageResult extends ProviderTestResult {}

export interface TtsPreviewMessageResult {
  audio: RemoteAudioPayload;
}

export interface SitePlaybackPreferencesMessageResult {
  playback: SitePlaybackPreferences | null;
}

export function isProviderConfigured(provider: ProviderConfig): boolean {
  return Boolean(provider.enabled && provider.baseUrl.trim() && provider.modelOrVoice.trim() && provider.apiKeyStoredLocally.trim());
}
