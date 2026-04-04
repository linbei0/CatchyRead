import { describe, expect, test } from 'vitest';

import { buildLlmConnectivityRequest, buildTtsConnectivityRequest } from '@/lib/providers/openaiCompatible';
import type { ProviderConfig } from '@/lib/shared/types';

const llmProvider: ProviderConfig = {
  providerId: 'llm-provider',
  kind: 'llm',
  enabled: true,
  baseUrl: 'https://example.com/v1',
  modelOrVoice: 'gpt-4.1-mini',
  apiKeyStoredLocally: 'llm-secret'
};

const ttsProvider: ProviderConfig = {
  providerId: 'tts-provider',
  kind: 'tts',
  enabled: true,
  baseUrl: 'https://example.com/v1',
  modelOrVoice: 'tts-1',
  apiKeyStoredLocally: 'tts-secret',
  voiceId: 'alloy'
};

describe('provider connectivity helpers', () => {
  test('构造 LLM 连通性探测请求', () => {
    const request = buildLlmConnectivityRequest(llmProvider);

    expect(request.url).toBe('https://example.com/v1/chat/completions');
    expect(String(request.init.body)).toContain('只回复：OK');
    expect(String(request.init.body)).toContain('"max_tokens":12');
  });

  test('DashScope OpenAI 兼容模式会改用 compatible-mode 路径', () => {
    const request = buildLlmConnectivityRequest({
      ...llmProvider,
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
    });

    expect(request.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  test('构造 TTS 连通性探测请求', () => {
    const request = buildTtsConnectivityRequest(ttsProvider);

    expect(request.url).toBe('https://example.com/v1/audio/speech');
    expect(String(request.init.body)).toContain('CatchyRead 连通性测试');
    expect(String(request.init.body)).toContain('"voice":"alloy"');
  });
});
