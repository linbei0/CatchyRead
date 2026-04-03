import browser from 'webextension-polyfill';

import type { AppSettings } from '@/lib/shared/types';

const STORAGE_KEY = 'catchyread.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  providers: {
    llm: {
      providerId: 'openai-compatible-llm',
      kind: 'llm',
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      modelOrVoice: 'gpt-4.1-mini',
      apiKeyStoredLocally: '',
      headers: {},
      temperature: 0.3,
      allowInsecureTransport: false,
      allowPrivateNetwork: false
    },
    tts: {
      providerId: 'openai-compatible-tts',
      kind: 'tts',
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      modelOrVoice: 'gpt-4o-mini-tts',
      apiKeyStoredLocally: '',
      headers: {},
      voiceId: 'alloy',
      allowInsecureTransport: false,
      allowPrivateNetwork: false
    }
  },
  playback: {
    rate: 1,
    mode: 'smart',
    codeStrategy: 'summary',
    speechEngine: 'browser'
  },
  ui: {
    collapsed: false,
    x: null,
    y: null
  }
};

function mergeSettings(partial?: Partial<AppSettings>): AppSettings {
  return {
    providers: {
      llm: {
        ...DEFAULT_SETTINGS.providers.llm,
        ...partial?.providers?.llm
      },
      tts: {
        ...DEFAULT_SETTINGS.providers.tts,
        ...partial?.providers?.tts
      }
    },
    playback: {
      ...DEFAULT_SETTINGS.playback,
      ...partial?.playback
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...partial?.ui
    }
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const data = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<AppSettings> | undefined;
  return mergeSettings(data);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = mergeSettings(settings);
  await browser.storage.local.set({
    [STORAGE_KEY]: normalized
  });
  return normalized;
}
