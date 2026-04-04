import type { ProviderConfig } from '@/lib/shared/types';

export const TTS_QUICK_START_FIELDS = ['providerId', 'apiKeyStoredLocally', 'modelOrVoice', 'voiceId'] as const;

const TTS_PROVIDER_PRESETS: Record<string, Pick<ProviderConfig, 'baseUrl' | 'modelOrVoice' | 'voiceId'>> = {
  'qwen-dashscope-tts': {
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    modelOrVoice: 'qwen3-tts-instruct-flash',
    voiceId: 'Cherry'
  },
  'openai-compatible-tts': {
    baseUrl: 'https://api.openai.com/v1',
    modelOrVoice: 'gpt-4o-mini-tts',
    voiceId: 'alloy'
  }
};

export function getTtsQuickStartFields(): string[] {
  return [...TTS_QUICK_START_FIELDS];
}

export function applyTtsProviderPreset(providerId: string, provider: ProviderConfig): ProviderConfig {
  const preset = TTS_PROVIDER_PRESETS[providerId];
  if (!preset) {
    return {
      ...provider,
      providerId
    };
  }

  return {
    ...provider,
    providerId,
    baseUrl: preset.baseUrl,
    modelOrVoice: preset.modelOrVoice,
    voiceId: preset.voiceId
  };
}

export function getTtsProviderAssistCopy(providerId: string): { summary: string; defaults: string } {
  if (providerId === 'qwen-dashscope-tts') {
    return {
      summary: '适合想快速接入中文语音的默认选项，推荐先从这里开始。',
      defaults: '默认会回填 DashScope 官方地址、Flash 模型与 Cherry 音色。'
    };
  }

  return {
    summary: '适合兼容 OpenAI 语音接口的自建或第三方服务。',
    defaults: '默认会回填 OpenAI 兼容地址、gpt-4o-mini-tts 与 alloy 音色。'
  };
}

export function buildTtsSetupChecklist(provider: ProviderConfig): Array<{ label: string; done: boolean }> {
  return [
    { label: '已选择 TTS 提供商', done: Boolean(provider.providerId) },
    { label: '已填写 API Key', done: Boolean(provider.apiKeyStoredLocally.trim()) },
    { label: '已填写模型', done: Boolean(provider.modelOrVoice.trim()) },
    { label: '已填写音色', done: Boolean((provider.voiceId || '').trim()) }
  ];
}
