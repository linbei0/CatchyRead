import type { ProviderConfig } from '@/lib/shared/types';
import { getTtsProviderAdapter } from '@/lib/tts/registry';

export function buildRequiredOriginsForProvider(provider: ProviderConfig): string[] {
  if (provider.kind === 'tts') {
    return getTtsProviderAdapter(provider.providerId).getRequiredOrigins(provider);
  }
  return [`${new URL(provider.baseUrl).origin}/*`];
}
