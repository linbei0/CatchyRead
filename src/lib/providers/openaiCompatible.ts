import type {
  ProviderConfig,
  RemoteAudioPayload,
  RewritePolicy,
  SmartScriptSegment,
  StructuredBlock
} from '@/lib/shared/types';
import { readErrorMessageOnce } from '@/lib/http/response-body';
import { getTtsProviderAdapter } from '@/lib/tts/registry';
import { assertSafeProviderConfig } from '@/lib/providers/security';

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveHeaders(provider: ProviderConfig): Record<string, string> {
  assertSafeProviderConfig(provider);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKeyStoredLocally}`,
    ...(provider.headers || {})
  };
}

export function selectBlocksForRewrite(blocks: StructuredBlock[], maxCharacters = 6000): StructuredBlock[] {
  const selected: StructuredBlock[] = [];
  let total = 0;

  for (const block of blocks) {
    const nextTotal = total + block.text.length;
    if (selected.length > 0 && nextTotal > maxCharacters) {
      break;
    }
    selected.push(block);
    total = nextTotal;
  }

  return selected;
}

export function buildLlmConnectivityRequest(provider: ProviderConfig): { url: string; init: RequestInit } {
  return {
    url: `${trimSlash(provider.baseUrl)}/chat/completions`,
    init: {
      method: 'POST',
      headers: resolveHeaders(provider),
      body: JSON.stringify({
        model: provider.modelOrVoice,
        temperature: 0,
        max_tokens: 12,
        messages: [
          {
            role: 'user',
            content: '请只回复：OK'
          }
        ]
      })
    }
  };
}

export function buildRewriteRequest(
  provider: ProviderConfig,
  blocks: StructuredBlock[],
  policy: RewritePolicy
): { url: string; init: RequestInit } {
  const selectedBlocks = selectBlocksForRewrite(blocks);
  const systemPrompt = [
    '你是一个网页朗读稿整理器。',
    '请把输入的结构化网页正文改写成适合听的口语稿，但不能改变事实、顺序、警告和结论。',
    '代码块默认只解释作用，不逐字念原文。',
    '你必须只输出 JSON，格式为 {"segments":[{"id":"","sectionTitle":"","spokenText":"","sourceBlockIds":[],"kind":"main|code-summary|warning"}]}。'
  ].join('\n');

  const userPrompt = JSON.stringify(
    {
      tone: policy.tone,
      preserveFacts: policy.preserveFacts,
      maxSegmentChars: policy.maxSegmentChars ?? 220,
      truncated: selectedBlocks.length < blocks.length,
      blocks: selectedBlocks
    },
    null,
    2
  );

  return {
    url: `${trimSlash(provider.baseUrl)}/chat/completions`,
    init: {
      method: 'POST',
      headers: resolveHeaders(provider),
      body: JSON.stringify({
        model: provider.modelOrVoice,
        temperature: provider.temperature ?? 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    }
  };
}

function extractJsonText(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || content.trim();
}

export function parseRewriteResponse(content: string): SmartScriptSegment[] {
  const jsonText = extractJsonText(content);
  const parsed = JSON.parse(jsonText) as { segments?: SmartScriptSegment[] };
  if (!Array.isArray(parsed.segments)) {
    throw new Error('LLM 返回的格式不正确，缺少 segments 数组。');
  }
  return parsed.segments.map((segment, index) => ({
    id: segment.id || `smart-segment-${index + 1}`,
    sectionTitle: segment.sectionTitle || '整理结果',
    spokenText: segment.spokenText,
    sourceBlockIds: Array.isArray(segment.sourceBlockIds) ? segment.sourceBlockIds : [],
    kind: segment.kind || 'main'
  }));
}

function readContentField(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' && item && 'text' in item ? String((item as { text?: string }).text || '') : ''))
      .join('\n');
  }
  return '';
}

export async function fetchRewriteSegments(
  provider: ProviderConfig,
  blocks: StructuredBlock[],
  policy: RewritePolicy,
  fetcher: typeof fetch = fetch
): Promise<SmartScriptSegment[]> {
  if (!provider.enabled || !provider.apiKeyStoredLocally.trim()) {
    throw new Error('未配置可用的 LLM 提供商。');
  }
  const request = buildRewriteRequest(provider, blocks, policy);
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    const details = await readErrorMessageOnce(response);
    throw new Error(`LLM 请求失败（${response.status}）：${details}`);
  }

  const data = await response.json();
  const content = readContentField(data?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('LLM 响应中没有可解析的内容。');
  }
  return parseRewriteResponse(content);
}

export function buildRemoteTtsRequest(
  provider: ProviderConfig,
  text: string,
  options: {
    voiceId?: string;
    rate: number;
  }
): { url: string; init: RequestInit } {
  return {
    url: `${trimSlash(provider.baseUrl)}/audio/speech`,
    init: {
      method: 'POST',
      headers: resolveHeaders(provider),
      body: JSON.stringify({
        model: provider.modelOrVoice,
        input: text,
        voice: options.voiceId || provider.voiceId || 'alloy',
        response_format: 'mp3',
        speed: options.rate
      })
    }
  };
}

export function buildTtsConnectivityRequest(provider: ProviderConfig): { url: string; init: RequestInit } {
  return buildRemoteTtsRequest(provider, 'CatchyRead 连通性测试。', {
    voiceId: provider.voiceId || 'alloy',
    rate: 1
  });
}

export async function fetchRemoteTtsAudio(
  provider: ProviderConfig,
  text: string,
  options: {
    voiceId?: string;
    rate: number;
  },
  fetcher: typeof fetch = fetch
): Promise<RemoteAudioPayload> {
  if (!provider.enabled || !provider.apiKeyStoredLocally.trim()) {
    throw new Error('未配置可用的远端 TTS 提供商。');
  }
  const adapter = getTtsProviderAdapter(provider.providerId);
  const request = adapter.buildSynthesisRequest(provider, text, options);
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    const details = await readErrorMessageOnce(response);
    throw new Error(`TTS 请求失败（${response.status}）：${details}`);
  }
  return adapter.parseSynthesisResponse(response, {
    provider,
    fetcher
  });
}

export async function testProviderConnectivity(
  providerKind: 'llm' | 'tts',
  loadSettingsFn: () => Promise<{ providers: { llm: ProviderConfig; tts: ProviderConfig } }> = async () =>
    (await import('@/lib/storage/settings')).loadSettings(),
  fetcher: typeof fetch = fetch
): Promise<{
  ok: boolean;
  providerKind: 'llm' | 'tts';
  message: string;
}> {
  const settings = await loadSettingsFn();
  const provider = providerKind === 'llm' ? settings.providers.llm : settings.providers.tts;

  if (!provider.enabled || !provider.baseUrl.trim() || !provider.modelOrVoice.trim() || !provider.apiKeyStoredLocally.trim()) {
    throw new Error(providerKind === 'llm' ? '请先完整配置并启用 LLM 提供商。' : '请先完整配置并启用 TTS 提供商。');
  }

  const request =
    providerKind === 'llm'
      ? buildLlmConnectivityRequest(provider)
      : getTtsProviderAdapter(provider.providerId).buildConnectivityRequest(provider);
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    const details = await readErrorMessageOnce(response);
    throw new Error(`${providerKind.toUpperCase()} 连通性测试失败（${response.status}）：${details}`);
  }

  if (providerKind === 'llm') {
    const data = await response.json();
    const content = readContentField(data?.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new Error('LLM 连通性测试失败：响应为空。');
    }
  } else {
    const audio = await getTtsProviderAdapter(provider.providerId).parseSynthesisResponse(response, {
      provider,
      fetcher
    });
    if (!audio.mediaUrl && !audio.base64Audio) {
      throw new Error('TTS 连通性测试失败：返回了空音频。');
    }
  }

  return {
    ok: true,
    providerKind,
    message: providerKind === 'llm' ? 'LLM 连通成功，可以正常返回文本。' : 'TTS 连通成功，可以正常返回音频。'
  };
}
