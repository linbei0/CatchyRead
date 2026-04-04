import type {
  AppSettings,
  ProviderTestResult,
  ProviderConfig,
  RewritePolicy,
  RemoteAudioPayload,
  StructuredBlock,
  UiPreferences
} from '@/lib/shared/types';

export type RuntimeMessage =
  | { type: 'catchyread/toggle-player' }
  | { type: 'catchyread/open-options' }
  | { type: 'catchyread/get-settings' }
  | { type: 'catchyread/save-settings'; payload: AppSettings }
  | { type: 'catchyread/save-ui-state'; payload: Partial<UiPreferences> }
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
      payload: {
        blocks: StructuredBlock[];
        policy: RewritePolicy;
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

export function isProviderConfigured(provider: ProviderConfig): boolean {
  return Boolean(provider.enabled && provider.baseUrl.trim() && provider.modelOrVoice.trim() && provider.apiKeyStoredLocally.trim());
}
