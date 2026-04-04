import type { AppSettings } from '@/shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  providers: {
    llm: {
      providerId: 'openai-compatible-llm',
      kind: 'llm',
      enabled: false,
      baseUrl: 'https://api.openai.com/v1',
      modelOrVoice: 'gpt-4.1-mini',
      apiKeyStoredLocally: '',
      headers: {},
      temperature: 0.3,
      allowInsecureTransport: false,
      allowPrivateNetwork: false
    },
    tts: {
      providerId: 'qwen-dashscope-tts',
      kind: 'tts',
      enabled: false,
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      modelOrVoice: 'qwen3-tts-instruct-flash',
      apiKeyStoredLocally: '',
      headers: {},
      voiceId: 'Cherry',
      allowInsecureTransport: false,
      allowPrivateNetwork: false
    }
  },
  playback: {
    rate: 1,
    mode: 'smart',
    codeStrategy: 'summary',
    speechEngine: 'browser',
    outputLanguage: 'follow-page',
    outputLocale: 'zh-CN'
  },
  ui: {
    collapsed: false,
    x: null,
    y: null
  }
};
