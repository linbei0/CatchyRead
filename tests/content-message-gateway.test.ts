import { describe, expect, test, vi } from 'vitest';

import type { AppSettings, PageSnapshot } from '@/shared/types';
import { BrowserContentMessageGateway } from '@/infra/runtime/content-message-gateway';

describe('BrowserContentMessageGateway', () => {
  test('通过统一网关发送内容脚本消息', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({
        settings: {
          providers: {
            llm: {} as AppSettings['providers']['llm'],
            tts: {} as AppSettings['providers']['tts']
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
        } satisfies AppSettings
      })
      .mockResolvedValueOnce({ segments: [{ id: 's-1' }] })
      .mockResolvedValueOnce({ audio: { mediaUrl: 'https://example.com/audio.mp3' } });
    const gateway = new BrowserContentMessageGateway(send);
    const snapshot: PageSnapshot = {
      url: 'https://example.com/doc',
      title: 'Doc',
      language: 'en-US',
      capturedAt: '2026-04-04T00:00:00.000Z',
      structuredBlocks: [{ id: 'b', canonicalBlockId: 'n1', type: 'paragraph', text: 'x', sourceElementId: 'n1', headingPath: [], priority: 'normal', isWarningLike: false }]
    };

    await gateway.loadSettings();
    await gateway.rewrite({
      snapshot,
      canonicalBlocks: snapshot.structuredBlocks,
      requestId: 'req-1',
      snapshotRevision: 2,
      policy: {
        preserveFacts: true,
        tone: 'podcast-lite',
        outputLanguage: 'follow-page',
        uiLanguage: 'zh-CN'
      }
    });
    await gateway.synthesizeRemote('hello', 1.2, 'Cherry');

    expect(send).toHaveBeenNthCalledWith(1, { type: 'catchyread/get-settings' });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: 'catchyread/rewrite',
      payload: {
        snapshot,
        canonicalBlocks: [{ id: 'b', canonicalBlockId: 'n1', type: 'paragraph', text: 'x', sourceElementId: 'n1', headingPath: [], priority: 'normal', isWarningLike: false }],
        requestId: 'req-1',
        snapshotRevision: 2,
        policy: {
          preserveFacts: true,
          tone: 'podcast-lite',
          outputLanguage: 'follow-page',
          uiLanguage: 'zh-CN'
        }
      }
    });
    expect(send).toHaveBeenNthCalledWith(3, {
      type: 'catchyread/synthesize-remote',
      payload: {
        text: 'hello',
        rate: 1.2,
        voiceId: 'Cherry'
      }
    });
  });
});
