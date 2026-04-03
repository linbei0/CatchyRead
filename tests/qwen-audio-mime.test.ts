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

describe('qwen audio mime inference', () => {
  test('当音频下载响应是通用二进制类型时，会根据 .wav URL 推断成 audio/wav', async () => {
    const response = new Response(
      JSON.stringify({
        output: {
          audio: {
            url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo.wav'
          }
        }
      }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'content-type': 'application/octet-stream'
        }
      })
    );

    const audio = await qwenDashScopeTtsAdapter.parseSynthesisResponse(response, {
      provider,
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(audio.mimeType).toBe('audio/wav');
  });
});
