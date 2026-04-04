import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

import { renderTtsQuickStartCard } from '@/options/markup';
import type { ProviderConfig } from '@/lib/shared/types';

const provider: ProviderConfig = {
  providerId: 'qwen-dashscope-tts',
  kind: 'tts',
  enabled: true,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  modelOrVoice: 'qwen3-tts-instruct-flash',
  apiKeyStoredLocally: '',
  headers: {},
  voiceId: 'Cherry',
  allowInsecureTransport: false,
  allowPrivateNetwork: false
};

describe('renderTtsQuickStartCard', () => {
  test('默认只把四个核心字段放在高级设置之外', () => {
    const html = renderTtsQuickStartCard({
      provider,
      providerOptions: [{ id: 'qwen-dashscope-tts', label: 'Qwen DashScope' }],
      apiKeyType: 'password',
      apiKeyVisible: false,
      previewReady: false
    });
    const dom = new JSDOM(`<body>${html}</body>`);

    const root = dom.window.document.body;
    const quickFields = Array.from(root.querySelectorAll('.field-grid.compact [name]')).map((node) => node.getAttribute('name'));
    const advancedFields = Array.from(root.querySelectorAll('details.advanced [name]')).map((node) => node.getAttribute('name'));

    expect(quickFields).toEqual(['tts.providerId', 'tts.apiKeyStoredLocally', 'tts.modelOrVoice', 'tts.voiceId']);
    expect(advancedFields).toContain('tts.baseUrl');
    expect(root.querySelector('#preview-tts-sample')).toBeNull();
  });
});
