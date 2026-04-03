import { describe, expect, test, vi } from 'vitest';

import { qwenDashScopeTtsAdapter } from '@/lib/tts/adapters/qwen-dashscope';
import type { ProviderConfig } from '@/lib/shared/types';

const provider: ProviderConfig = {
  providerId: 'qwen-dashscope-tts',
  kind: 'tts',
  enabled: true,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  modelOrVoice: 'qwen3-tts-instruct-flash',
  apiKeyStoredLocally: 'secret',
  voiceId: 'Cherry'
};

describe('qwen fetch binding', () => {
  test('下载 audio.url 时不会以 requestContext 作为 fetch 的 this', async () => {
    const response = new Response(
      JSON.stringify({
        output: {
          audio: {
            url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo.wav'
          }
        }
      }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    const fetcher = vi.fn(async function (this: unknown) {
      if (this && this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'content-type': 'audio/wav'
        }
      });
    });

    await expect(
      qwenDashScopeTtsAdapter.parseSynthesisResponse(response, {
        provider,
        fetcher: fetcher as unknown as typeof fetch
      })
    ).resolves.toMatchObject({
      mimeType: 'audio/wav'
    });
  });
});
