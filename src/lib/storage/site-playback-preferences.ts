import browser from 'webextension-polyfill';

import type { PlaybackPreferences, SitePlaybackPreferences } from '@/shared/types';

export const SITE_PLAYBACK_PREFERENCES_STORAGE_KEY = 'catchyread.site-playback-preferences';

function normalizeRate(rate: number | undefined): number | undefined {
  if (!Number.isFinite(rate)) {
    return undefined;
  }
  return Math.max(0.5, Math.min(4, Number(rate)));
}

function sanitizeSitePlaybackPreferences(preferences: SitePlaybackPreferences): SitePlaybackPreferences {
  const sanitized: SitePlaybackPreferences = {};
  if (preferences.mode) {
    sanitized.mode = preferences.mode;
  }
  if (preferences.codeStrategy) {
    sanitized.codeStrategy = preferences.codeStrategy;
  }
  if (preferences.speechEngine) {
    sanitized.speechEngine = preferences.speechEngine;
  }
  const rate = normalizeRate(preferences.rate);
  if (rate !== undefined) {
    sanitized.rate = rate;
  }
  return sanitized;
}

export function getSitePreferencesKey(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function mergeSitePlaybackPreferences(
  current: SitePlaybackPreferences,
  partial: SitePlaybackPreferences
): SitePlaybackPreferences {
  return {
    ...current,
    ...sanitizeSitePlaybackPreferences(partial)
  };
}

export function resolvePlaybackPreferences(
  base: PlaybackPreferences,
  sitePreferences?: SitePlaybackPreferences | null
): PlaybackPreferences {
  return {
    ...base,
    ...sanitizeSitePlaybackPreferences(sitePreferences || {})
  };
}

export async function loadSitePlaybackPreferences(url: string): Promise<SitePlaybackPreferences | null> {
  const bucket =
    ((await browser.storage.local.get(SITE_PLAYBACK_PREFERENCES_STORAGE_KEY))[SITE_PLAYBACK_PREFERENCES_STORAGE_KEY] as
      | Record<string, SitePlaybackPreferences>
      | undefined) || {};
  return bucket[getSitePreferencesKey(url)] || null;
}

export async function saveSitePlaybackPreferences(
  url: string,
  partial: SitePlaybackPreferences
): Promise<SitePlaybackPreferences> {
  const key = getSitePreferencesKey(url);
  const bucket =
    ((await browser.storage.local.get(SITE_PLAYBACK_PREFERENCES_STORAGE_KEY))[SITE_PLAYBACK_PREFERENCES_STORAGE_KEY] as
      | Record<string, SitePlaybackPreferences>
      | undefined) || {};

  const merged = mergeSitePlaybackPreferences(bucket[key] || {}, partial);
  await browser.storage.local.set({
    [SITE_PLAYBACK_PREFERENCES_STORAGE_KEY]: {
      ...bucket,
      [key]: merged
    }
  });
  return merged;
}
