import { describe, expect, test } from 'vitest';

import { getTtsProviderAdapter } from '@/lib/tts/registry';
import { buildRequiredOriginsForProvider } from '@/lib/permissions/provider-host-access';
import type { ProviderConfig } from '@/lib/shared/types';

const qwenProvider: ProviderConfig = {
  providerId: 'qwen-dashscope-tts',
  kind: 'tts',
  enabled: true,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  modelOrVoice: 'qwen3-tts-instruct-flash',
  apiKeyStoredLocally: 'secret',
  voiceId: 'Cherry'
};

describe('qwen dashscope tts adapter', () => {
  test('按官方接口构造语音合成请求', () => {
    const adapter = getTtsProviderAdapter(qwenProvider.providerId);
    const request = adapter.buildSynthesisRequest(qwenProvider, '你好，欢迎使用 CatchyRead。', {
      voiceId: 'Cherry',
      rate: 1
    });

    expect(request.url).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(String(request.init.body)).toContain('"model":"qwen3-tts-instruct-flash"');
    expect(String(request.init.body)).toContain('"voice":"Cherry"');
    expect(String(request.init.body)).toContain('"text":"你好，欢迎使用 CatchyRead。"');
  });

  test('Qwen provider 需要申请 DashScope 与阿里云音频域名访问权限', () => {
    const origins = buildRequiredOriginsForProvider(qwenProvider);

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://dashscope.aliyuncs.com/*',
        'https://*.aliyuncs.com/*',
        'http://*.aliyuncs.com/*'
      ])
    );
  });

  test('realtime 模型不能走当前 HTTP TTS 适配器', () => {
    const adapter = getTtsProviderAdapter(qwenProvider.providerId);

    expect(() =>
      adapter.buildSynthesisRequest(
        {
          ...qwenProvider,
          modelOrVoice: 'qwen3-tts-vd-realtime-2026-01-15'
        },
        '你好',
        { voiceId: 'Cherry', rate: 1 }
      )
    ).toThrow('Realtime 模型');
  });
});
