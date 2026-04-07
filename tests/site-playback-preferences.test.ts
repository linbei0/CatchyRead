import { describe, expect, test, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn()
      }
    }
  }
}));

import {
  getSitePreferencesKey,
  mergeSitePlaybackPreferences,
  resolvePlaybackPreferences
} from '@/lib/storage/site-playback-preferences';
import type { PlaybackPreferences, SitePlaybackPreferences } from '@/shared/types';

describe('site-playback-preferences', () => {
  test('按 hostname 归一化站点偏好键', () => {
    expect(getSitePreferencesKey('https://React.dev/reference/react/useEffect')).toBe('react.dev');
    expect(getSitePreferencesKey('https://docs.python.org/3/library/dataclasses.html')).toBe('docs.python.org');
  });

  test('合并站点偏好时只覆盖页面级字段', () => {
    const merged = mergeSitePlaybackPreferences(
      {
        mode: 'smart',
        codeStrategy: 'summary',
        speechEngine: 'browser',
        rate: 1
      },
      {
        codeStrategy: 'skip',
        rate: 1.4
      }
    );

    expect(merged).toEqual({
      mode: 'smart',
      codeStrategy: 'skip',
      speechEngine: 'browser',
      rate: 1.4
    });
  });

  test('解析有效播放配置时用站点偏好覆盖全局设置', () => {
    const base: PlaybackPreferences = {
      mode: 'smart',
      codeStrategy: 'summary',
      speechEngine: 'browser',
      rate: 1,
      outputLanguage: 'follow-page',
      outputLocale: 'zh-CN'
    };
    const site: SitePlaybackPreferences = {
      mode: 'original',
      speechEngine: 'remote',
      rate: 1.2
    };

    expect(resolvePlaybackPreferences(base, site)).toEqual({
      mode: 'original',
      codeStrategy: 'summary',
      speechEngine: 'remote',
      rate: 1.2,
      outputLanguage: 'follow-page',
      outputLocale: 'zh-CN'
    });
  });
});
