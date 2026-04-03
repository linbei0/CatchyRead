import { openAiCompatibleTtsAdapter } from '@/lib/tts/adapters/openai-compatible';
import { qwenDashScopeTtsAdapter } from '@/lib/tts/adapters/qwen-dashscope';
import type { TtsProviderAdapter } from '@/lib/tts/types';

const TTS_PROVIDER_ADAPTERS: TtsProviderAdapter[] = [openAiCompatibleTtsAdapter, qwenDashScopeTtsAdapter];

export function listTtsProviderAdapters(): TtsProviderAdapter[] {
  return [...TTS_PROVIDER_ADAPTERS];
}

export function getTtsProviderAdapter(providerId: string): TtsProviderAdapter {
  const adapter = TTS_PROVIDER_ADAPTERS.find((item) => item.id === providerId);
  if (!adapter) {
    throw new Error(`不支持的 TTS Provider：${providerId}`);
  }
  return adapter;
}
