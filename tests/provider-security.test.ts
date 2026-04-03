import { describe, expect, test } from 'vitest';

import { assertSafeProviderConfig } from '@/lib/providers/security';
import type { ProviderConfig } from '@/lib/shared/types';

function createProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    providerId: 'provider',
    kind: 'llm',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    modelOrVoice: 'demo-model',
    apiKeyStoredLocally: 'secret',
    headers: {},
    ...overrides
  };
}

describe('assertSafeProviderConfig', () => {
  test('默认拒绝 http 端点', () => {
    expect(() =>
      assertSafeProviderConfig(
        createProvider({
          baseUrl: 'http://api.example.com/v1'
        })
      )
    ).toThrow('只允许使用 HTTPS');
  });

  test('默认拒绝本地或私网端点', () => {
    expect(() =>
      assertSafeProviderConfig(
        createProvider({
          baseUrl: 'https://127.0.0.1:11434/v1'
        })
      )
    ).toThrow('私有网络');
  });

  test('显式开启开发模式后允许本地 HTTP 端点', () => {
    expect(() =>
      assertSafeProviderConfig(
        createProvider({
          baseUrl: 'http://127.0.0.1:11434/v1',
          allowInsecureTransport: true,
          allowPrivateNetwork: true
        })
      )
    ).not.toThrow();
  });

  test('拒绝危险自定义请求头', () => {
    expect(() =>
      assertSafeProviderConfig(
        createProvider({
          headers: {
            Cookie: 'sid=1'
          }
        })
      )
    ).toThrow('不允许自定义请求头');
  });
});
