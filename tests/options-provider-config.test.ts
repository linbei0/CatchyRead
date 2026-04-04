import { describe, expect, test } from 'vitest';

import { getTtsQuickStartFields, applyTtsProviderPreset } from '@/options/provider-config';
import type { ProviderConfig } from '@/lib/shared/types';

const baseTtsProvider: ProviderConfig = {
  providerId: 'qwen-dashscope-tts',
  kind: 'tts',
  enabled: false,
  baseUrl: '',
  modelOrVoice: '',
  apiKeyStoredLocally: '',
  headers: {},
  voiceId: '',
  allowInsecureTransport: false,
  allowPrivateNetwork: false
};

describe('provider quick-start helpers', () => {
  test('切换 Qwen Provider 时自动回填推荐值', () => {
    const provider = applyTtsProviderPreset('qwen-dashscope-tts', baseTtsProvider);

    expect(provider.baseUrl).toBe('https://dashscope.aliyuncs.com/api/v1');
    expect(provider.modelOrVoice).toBe('qwen3-tts-instruct-flash');
    expect(provider.voiceId).toBe('Cherry');
  });

  test('快速开声默认只暴露四个核心字段', () => {
    expect(getTtsQuickStartFields()).toEqual(['providerId', 'apiKeyStoredLocally', 'modelOrVoice', 'voiceId']);
  });
});
