import type { UiPreferences } from '@/lib/shared/types';

export function mergeUiPreferences(current: UiPreferences, partial: Partial<UiPreferences>): UiPreferences {
  return {
    ...current,
    ...partial
  };
}

export async function updateUiPreferences(partial: Partial<UiPreferences>): Promise<UiPreferences> {
  const { loadSettings, saveSettings } = await import('@/lib/storage/settings');
  const settings = await loadSettings();
  const ui = mergeUiPreferences(settings.ui, partial);
  await saveSettings({
    ...settings,
    ui
  });
  return ui;
}
