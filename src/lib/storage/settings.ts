import browser from 'webextension-polyfill';

import { DEFAULT_SETTINGS } from '@/shared/default-settings';
import type { AppSettings } from '@/lib/shared/types';

export const SETTINGS_STORAGE_KEY = 'catchyread.settings';

export function mergeSettings(partial?: Partial<AppSettings>): AppSettings {
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
  const data = (await browser.storage.local.get(SETTINGS_STORAGE_KEY))[SETTINGS_STORAGE_KEY] as Partial<AppSettings> | undefined;
  return mergeSettings(data);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = mergeSettings(settings);
  await browser.storage.local.set({
    [SETTINGS_STORAGE_KEY]: normalized
  });
  return normalized;
}
