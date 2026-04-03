import type { ProviderConfig, RemoteAudioPayload } from '@/lib/shared/types';

export interface TtsSynthesisOptions {
  voiceId?: string;
  rate: number;
}

export interface TtsProviderAdapter {
  id: string;
  label: string;
  buildSynthesisRequest(provider: ProviderConfig, text: string, options: TtsSynthesisOptions): {
    url: string;
    init: RequestInit;
  };
  parseSynthesisResponse(
    response: Response,
    requestContext: {
      provider: ProviderConfig;
      fetcher: typeof fetch;
    }
  ): Promise<RemoteAudioPayload>;
  buildConnectivityRequest(provider: ProviderConfig): {
    url: string;
    init: RequestInit;
  };
  getRequiredOrigins(provider: ProviderConfig): string[];
}
