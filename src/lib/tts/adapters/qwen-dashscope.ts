import type { ProviderConfig, RemoteAudioPayload } from '@/lib/shared/types';
import { normalizeRemoteMediaUrl } from '@/lib/tts/media-url';
import type { TtsProviderAdapter } from '@/lib/tts/types';

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function assertHttpCompatibleQwenModel(model: string): void {
  if (/realtime/i.test(model)) {
    throw new Error(
      'Realtime 模型不能走当前 HTTP TTS 适配器。请改用 `qwen3-tts-instruct-flash` 或 `qwen3-tts-vd-2026-01-26`，若要支持 realtime，需要单独实现 WebSocket Realtime API。'
    );
  }
}

function resolveHeaders(provider: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKeyStoredLocally}`,
    ...(provider.headers || {})
  };
}

function inferAudioMimeType(audioUrl: string, responseMimeType: string | null): string {
  const normalized = (responseMimeType || '').toLowerCase();
  if (normalized.startsWith('audio/')) {
    return normalized;
  }

  if (/\.wav(\?|$)/i.test(audioUrl)) {
    return 'audio/wav';
  }
  if (/\.mp3(\?|$)/i.test(audioUrl)) {
    return 'audio/mpeg';
  }
  if (/\.ogg(\?|$)/i.test(audioUrl)) {
    return 'audio/ogg';
  }

  return normalized || 'audio/mpeg';
}

export const qwenDashScopeTtsAdapter: TtsProviderAdapter = {
  id: 'qwen-dashscope-tts',
  label: 'Qwen DashScope',
  buildSynthesisRequest(provider, text, options) {
    assertHttpCompatibleQwenModel(provider.modelOrVoice);
    return {
      url: `${trimSlash(provider.baseUrl)}/services/aigc/multimodal-generation/generation`,
      init: {
        method: 'POST',
        headers: resolveHeaders(provider),
        body: JSON.stringify({
          model: provider.modelOrVoice,
          input: {
            text,
            voice: options.voiceId || provider.voiceId || 'Cherry'
          }
        })
      }
    };
  },
  async parseSynthesisResponse(response, requestContext): Promise<RemoteAudioPayload> {
    const data = (await response.json()) as {
      output?: {
        audio?: {
          url?: string;
          data?: string;
        };
      };
    };

    const audioData = data.output?.audio?.data;
    if (audioData) {
      return {
        mimeType: 'audio/mpeg',
        base64Audio: audioData
      };
    }

    const audioUrl = data.output?.audio?.url;
    if (!audioUrl) {
      throw new Error('Qwen TTS 响应中缺少音频数据或音频 URL。');
    }

    const safeFetch = requestContext.fetcher.bind(globalThis);
    const audioResponse = await safeFetch(audioUrl, {
      method: 'GET'
    });
    if (!audioResponse.ok) {
      throw new Error(`Qwen TTS 音频下载失败（${audioResponse.status}）。`);
    }
    return {
      mimeType: inferAudioMimeType(audioUrl, audioResponse.headers.get('content-type')),
      mediaUrl: normalizeRemoteMediaUrl(audioUrl)
    };
  },
  buildConnectivityRequest(provider) {
    assertHttpCompatibleQwenModel(provider.modelOrVoice);
    return {
      url: `${trimSlash(provider.baseUrl)}/services/aigc/multimodal-generation/generation`,
      init: {
        method: 'POST',
        headers: resolveHeaders(provider),
        body: JSON.stringify({
          model: provider.modelOrVoice,
          input: {
            text: 'CatchyRead 连通性测试。',
            voice: provider.voiceId || 'Cherry'
          }
        })
      }
    };
  },
  getRequiredOrigins(provider) {
    const origin = new URL(provider.baseUrl).origin;
    return [`${origin}/*`, 'https://*.aliyuncs.com/*', 'http://*.aliyuncs.com/*'];
  }
};
