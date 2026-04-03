import type { RuntimeMessage } from '@/lib/shared/messages';
import type { fetchRemoteTtsAudio, fetchRewriteSegments } from '@/lib/providers/openaiCompatible';
import type { loadSettings, saveSettings } from '@/lib/storage/settings';
import type { updateUiPreferences } from '@/lib/storage/ui-preferences';

export interface RuntimeMessageDependencies {
  openOptionsPage: () => Promise<void>;
  loadSettings: typeof loadSettings;
  saveSettings: typeof saveSettings;
  fetchRewriteSegments: typeof fetchRewriteSegments;
  fetchRemoteTtsAudio: typeof fetchRemoteTtsAudio;
  testProviderConnectivity: (providerKind: 'llm' | 'tts') => Promise<{
    ok: boolean;
    providerKind: 'llm' | 'tts';
    message: string;
  }>;
  updateUiPreferences: typeof updateUiPreferences;
}

export async function handleRuntimeMessage(
  message: RuntimeMessage,
  deps: RuntimeMessageDependencies
): Promise<unknown> {
  switch (message.type) {
    case 'catchyread/open-options':
      await deps.openOptionsPage();
      return { ok: true };
    case 'catchyread/test-provider':
      return deps.testProviderConnectivity(message.payload.providerKind);
    case 'catchyread/save-ui-state':
      return {
        ui: await deps.updateUiPreferences(message.payload)
      };
    case 'catchyread/get-settings':
      return {
        settings: await deps.loadSettings()
      };
    case 'catchyread/save-settings':
      return {
        settings: await deps.saveSettings(message.payload)
      };
    case 'catchyread/rewrite': {
      const settings = await deps.loadSettings();
      const segments = await deps.fetchRewriteSegments(settings.providers.llm, message.payload.blocks, message.payload.policy);
      return { segments };
    }
    case 'catchyread/synthesize-remote': {
      const settings = await deps.loadSettings();
      const audio = await deps.fetchRemoteTtsAudio(settings.providers.tts, message.payload.text, {
        voiceId: message.payload.voiceId,
        rate: message.payload.rate
      });
      return { audio };
    }
    default:
      return undefined;
  }
}
