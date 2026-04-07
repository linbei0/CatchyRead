import {
  createRuntimeMessageRouter,
  type ProviderGateway,
  type SettingsRepository,
  type SitePlaybackPreferencesRepository,
  type UiPreferencesRepository
} from '@/background/runtime-message-router';
import type { ProviderTestResult } from '@/shared/types';
import type { RuntimeMessage } from '@/shared/messages';
import type { fetchRemoteTtsAudio, fetchRewriteSegments } from '@/lib/providers/openaiCompatible';
import type { loadSettings, saveSettings } from '@/lib/storage/settings';
import type { loadSitePlaybackPreferences, saveSitePlaybackPreferences } from '@/lib/storage/site-playback-preferences';
import type { updateUiPreferences } from '@/lib/storage/ui-preferences';

export interface RuntimeMessageDependencies {
  openOptionsPage: () => Promise<void>;
  loadSettings: typeof loadSettings;
  saveSettings: typeof saveSettings;
  fetchRewriteSegments: typeof fetchRewriteSegments;
  fetchRemoteTtsAudio: typeof fetchRemoteTtsAudio;
  testProviderConnectivity: (providerKind: 'llm' | 'tts') => Promise<ProviderTestResult>;
  updateUiPreferences: typeof updateUiPreferences;
  loadSitePlaybackPreferences: typeof loadSitePlaybackPreferences;
  saveSitePlaybackPreferences: typeof saveSitePlaybackPreferences;
}

export async function handleRuntimeMessage(
  message: RuntimeMessage,
  deps: RuntimeMessageDependencies
): Promise<unknown> {
  const settingsRepository: SettingsRepository = {
    load: deps.loadSettings,
    save: deps.saveSettings
  };
  const uiPreferencesRepository: UiPreferencesRepository = {
    update: deps.updateUiPreferences
  };
  const sitePlaybackPreferencesRepository: SitePlaybackPreferencesRepository = {
    load: deps.loadSitePlaybackPreferences,
    save: deps.saveSitePlaybackPreferences
  };
  const providerGateway: ProviderGateway = {
    rewrite: (provider, payload) => deps.fetchRewriteSegments(provider, payload),
    cancelRewrite: async () => {},
    synthesizeRemote: (provider, payload) =>
      deps.fetchRemoteTtsAudio(provider, payload.text, {
        voiceId: payload.voiceId,
        rate: payload.rate
      }),
    previewTtsSample: (provider, text) =>
      deps.fetchRemoteTtsAudio(provider, text, {
        rate: 1,
        voiceId: provider.voiceId
      }),
    testConnectivity: deps.testProviderConnectivity
  };
  return createRuntimeMessageRouter({
    openOptionsPage: deps.openOptionsPage,
    settingsRepository,
    uiPreferencesRepository,
    sitePlaybackPreferencesRepository,
    providerGateway
  })(message);
}
