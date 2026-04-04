import { describe, expect, test, vi } from 'vitest';

import { createRuntimeMessageRouter } from '@/background/runtime-message-router';
import type { RuntimeMessage } from '@/shared/messages';

describe('createRuntimeMessageRouter', () => {
  test('按消息类型路由并保持返回结构兼容', async () => {
    const router = createRuntimeMessageRouter({
      openOptionsPage: vi.fn().mockResolvedValue(undefined),
      settingsRepository: {
        load: vi.fn().mockResolvedValue({ providers: { llm: {}, tts: {} } }),
        save: vi.fn().mockResolvedValue({ playback: { rate: 1.4 } })
      },
      uiPreferencesRepository: {
        update: vi.fn().mockResolvedValue({ collapsed: true, x: 10, y: 20 })
      },
      providerGateway: {
        rewrite: vi.fn().mockResolvedValue([{ id: 'seg-1' }]),
        synthesizeRemote: vi.fn().mockResolvedValue({ mediaUrl: 'https://audio.example.com/1.mp3' }),
        previewTtsSample: vi.fn().mockResolvedValue({ mediaUrl: 'https://audio.example.com/preview.mp3' }),
        testConnectivity: vi.fn().mockResolvedValue({ ok: true, title: 'OK' })
      }
    });

    await expect(router({ type: 'catchyread/open-options' } as RuntimeMessage)).resolves.toEqual({ ok: true });
    await expect(router({ type: 'catchyread/save-ui-state', payload: { collapsed: true } } as RuntimeMessage)).resolves.toEqual({
      ui: { collapsed: true, x: 10, y: 20 }
    });
    await expect(router({ type: 'catchyread/rewrite', payload: { blocks: [], policy: { preserveFacts: true, tone: 'podcast-lite' } } } as RuntimeMessage)).resolves.toEqual({
      segments: [{ id: 'seg-1' }]
    });
  });
});
