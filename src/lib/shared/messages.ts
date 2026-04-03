import type {
  AppSettings,
  ProviderConfig,
  RewritePolicy,
  StructuredBlock
} from '@/lib/shared/types';

export type RuntimeMessage =
  | { type: 'catchyread/toggle-player' }
  | { type: 'catchyread/open-options' }
  | { type: 'catchyread/get-settings' }
  | { type: 'catchyread/save-settings'; payload: AppSettings }
  | {
      type: 'catchyread/test-provider';
      payload: {
        providerKind: 'llm' | 'tts';
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

export function isProviderConfigured(provider: ProviderConfig): boolean {
  return Boolean(provider.enabled && provider.baseUrl.trim() && provider.modelOrVoice.trim() && provider.apiKeyStoredLocally.trim());
}
