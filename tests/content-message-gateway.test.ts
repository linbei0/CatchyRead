import { describe, expect, test, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

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

  test('监听到设置存储变化时会重新加载并推送最新设置', async () => {
    const listenerBag: Array<(changes: Record<string, { newValue?: unknown }>, areaName: string) => void> = [];
    const addListener = vi.fn((listener) => {
      listenerBag.push(listener);
    });
    const removeListener = vi.fn((listener) => {
      const index = listenerBag.indexOf(listener);
      if (index >= 0) {
        listenerBag.splice(index, 1);
      }
    });
    const send = vi.fn().mockResolvedValue({
      settings: {
        providers: {
          llm: { enabled: true } as AppSettings['providers']['llm'],
          tts: { enabled: true, voiceId: 'Cherry' } as AppSettings['providers']['tts']
        },
        playback: {
          rate: 1.25,
          mode: 'smart',
          codeStrategy: 'summary',
          speechEngine: 'remote',
          outputLanguage: 'follow-page',
          outputLocale: 'zh-CN'
        },
        ui: {
          collapsed: false,
          x: null,
          y: null
        }
      } satisfies AppSettings
    });
    const gateway = new BrowserContentMessageGateway(send, {
      onChanged: {
        addListener,
        removeListener
      }
    } as never);
    const onSettings = vi.fn();

    const unsubscribe = gateway.observeSettings(onSettings);
    await listenerBag[0]?.({ 'catchyread.settings': { newValue: { changed: true } } }, 'local');

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'catchyread/get-settings' });
    expect(onSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        playback: expect.objectContaining({
          rate: 1.25
        })
      })
    );

    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
