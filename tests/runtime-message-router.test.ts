import { describe, expect, test, vi } from 'vitest';

import { createRuntimeMessageRouter } from '@/background/runtime-message-router';
import type { RuntimeMessage } from '@/shared/messages';
import type { PageSnapshot, RewriteRequestPayload, StructuredBlock } from '@/shared/types';

describe('createRuntimeMessageRouter', () => {
  test('按消息类型路由并保持返回结构兼容', async () => {
    const block: StructuredBlock = {
      id: 'paragraph-1',
      canonicalBlockId: 'catchyread-1',
      type: 'paragraph',
      text: 'hello',
      sourceElementId: 'catchyread-1',
      headingPath: [],
      priority: 'normal',
      isWarningLike: false
    };
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Doc',
      language: 'en-US',
      capturedAt: '2026-04-04T00:00:00.000Z',
      structuredBlocks: [block]
    };
    const rewritePayload: RewriteRequestPayload = {
      snapshot,
      canonicalBlocks: [block],
      requestId: 'req-1',
      snapshotRevision: 1,
      policy: {
        preserveFacts: true,
        tone: 'podcast-lite',
        outputLanguage: 'follow-page',
        uiLanguage: 'zh-CN'
      }
    };
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
        cancelRewrite: vi.fn().mockResolvedValue(undefined),
        synthesizeRemote: vi.fn().mockResolvedValue({ mediaUrl: 'https://audio.example.com/1.mp3' }),
        previewTtsSample: vi.fn().mockResolvedValue({ mediaUrl: 'https://audio.example.com/preview.mp3' }),
        testConnectivity: vi.fn().mockResolvedValue({ ok: true, title: 'OK' })
      }
    });

    await expect(router({ type: 'catchyread/open-options' } as RuntimeMessage)).resolves.toEqual({ ok: true });
    await expect(router({ type: 'catchyread/save-ui-state', payload: { collapsed: true } } as RuntimeMessage)).resolves.toEqual({
      ui: { collapsed: true, x: 10, y: 20 }
    });
    await expect(router({ type: 'catchyread/rewrite', payload: rewritePayload } as RuntimeMessage)).resolves.toEqual({
      segments: [{ id: 'seg-1' }]
    });
  });
});
