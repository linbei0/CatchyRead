import { buildRemoteTtsRequest, buildTtsConnectivityRequest } from '@/lib/providers/openaiCompatible';
import type { RemoteAudioPayload } from '@/lib/shared/types';
import type { TtsProviderAdapter } from '@/lib/tts/types';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const item of bytes) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary);
}

export const openAiCompatibleTtsAdapter: TtsProviderAdapter = {
  id: 'openai-compatible-tts',
  label: 'OpenAI Compatible',
  buildSynthesisRequest(provider, text, options) {
    return buildRemoteTtsRequest(provider, text, options);
  },
  async parseSynthesisResponse(response): Promise<RemoteAudioPayload> {
    const buffer = await response.arrayBuffer();
    return {
      mimeType: response.headers.get('content-type') || 'audio/mpeg',
      base64Audio: arrayBufferToBase64(buffer)
    };
  },
  buildConnectivityRequest(provider) {
    return buildTtsConnectivityRequest(provider);
  },
  getRequiredOrigins(provider) {
    const origin = new URL(provider.baseUrl).origin;
    return [`${origin}/*`];
  }
};
