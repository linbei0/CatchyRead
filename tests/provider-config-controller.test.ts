import { describe, expect, test, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({
  default: {
    permissions: {
      request: vi.fn()
    }
  }
}));

import { ProviderConfigController } from '@/app/options/provider-config-controller';
import type { AppSettings } from '@/shared/types';

const settings: AppSettings = {
  providers: {
    llm: {
      providerId: 'openai-compatible-llm',
      kind: 'llm',
      enabled: true,
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      modelOrVoice: 'qwen-plus',
      apiKeyStoredLocally: 'llm-key',
      headers: {}
    },
    tts: {
      providerId: 'qwen-dashscope-tts',
      kind: 'tts',
      enabled: true,
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      modelOrVoice: 'qwen3-tts-instruct-flash',
      apiKeyStoredLocally: 'tts-key',
      headers: {},
      voiceId: 'Cherry'
    }
  },
  playback: {
    rate: 1,
    mode: 'smart',
    codeStrategy: 'summary',
    speechEngine: 'remote'
  },
  ui: {
    collapsed: false,
    x: null,
    y: null
  }
};

describe('ProviderConfigController', () => {
  test('保存设置时把所需域名权限合并为一次请求', async () => {
    const request = vi.fn().mockResolvedValue(true);
    const saveSettings = vi.fn().mockResolvedValue(settings);
    const controller = new ProviderConfigController(
      {
        loadSettings: vi.fn(),
        saveSettings,
        testProvider: vi.fn(),
        previewSample: vi.fn()
      } as never,
      { request }
    );

    await controller.saveSettings(settings);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      origins: ['https://dashscope.aliyuncs.com/*', 'https://*.aliyuncs.com/*', 'http://*.aliyuncs.com/*']
    });
    expect(saveSettings).toHaveBeenCalledWith(settings);
  });

  test('测试单个 Provider 时只请求该 Provider 所需权限，再保存并发起测试', async () => {
    const request = vi.fn().mockResolvedValue(true);
    const saveSettings = vi.fn().mockResolvedValue(settings);
    const testProvider = vi.fn().mockResolvedValue({
      ok: true,
      providerKind: 'llm',
      category: 'success',
      title: '智能整理已连通',
      message: '现在可以整理网页内容了。',
      recommendedAction: '回到播放器后可以直接试试“智能整理”。'
    });
    const controller = new ProviderConfigController(
      {
        loadSettings: vi.fn(),
        saveSettings,
        testProvider,
        previewSample: vi.fn()
      } as never,
      { request }
    );

    await controller.testProvider('llm', settings);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      origins: ['https://dashscope.aliyuncs.com/*']
    });
    expect(saveSettings).toHaveBeenCalledWith(settings);
    expect(testProvider).toHaveBeenCalledWith('llm');
  });
});
