import {
  buildRewriteChunks,
  getRewriteBlockSourceIds,
  normalizeStructuredBlocksForRewrite,
  prepareStructuredBlocksForRewrite,
  shouldUseMultiChunkRewrite,
  validateRewriteSegments
} from '@/domain/content/rewrite-pipeline';
import type {
  ProviderTestResult,
  ProviderConfig,
  RemoteAudioPayload,
  RewriteRequestPayload,
  SmartScriptSegment,
  StructuredBlock
} from '@/shared/types';
import { readErrorMessageOnce } from '@/lib/http/response-body';
import { assertSafeProviderConfig } from '@/lib/providers/security';
import { getTtsProviderAdapter } from '@/lib/tts/registry';
import { buildSuccessNotice, mapErrorToNotice, noticeToProviderTestResult } from '@/lib/ui/feedback';

const STRUCTURED_OUTPUT_CACHE_TTL_MS = 10 * 60 * 1000;

const structuredOutputSupportCache = new Map<string, { supported: boolean; checkedAt: number }>();

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function providerFingerprint(provider: ProviderConfig): string {
  return [provider.providerId, provider.baseUrl, provider.modelOrVoice].join('::');
}

function resolveLlmBaseUrl(baseUrl: string): string {
  const trimmed = trimSlash(baseUrl);
  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    if (parsed.hostname === 'dashscope.aliyuncs.com' && normalizedPath === '/api/v1') {
      return `${parsed.origin}/compatible-mode/v1`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function resolveHeaders(provider: ProviderConfig): Record<string, string> {
  assertSafeProviderConfig(provider);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKeyStoredLocally}`,
    ...(provider.headers || {})
  };
}

function resolveTargetLanguage(payload: RewriteRequestPayload): string {
  const policy = payload.policy;
  if (policy.outputLanguage === 'follow-ui') {
    return policy.uiLanguage || payload.snapshot.language || 'zh-CN';
  }
  if (policy.outputLanguage === 'explicit-locale') {
    return policy.outputLocale || policy.uiLanguage || payload.snapshot.language || 'zh-CN';
  }
  return payload.snapshot.language || policy.uiLanguage || 'zh-CN';
}

function buildSystemPrompt(
  targetLanguage: string,
  codeStrategy: RewriteRequestPayload['policy']['codeStrategy'],
  structuredOutputs: boolean
): string {
  const isChinese = /^zh\b/i.test(targetLanguage);
  if (isChinese) {
    const sharedLines = [
      '你是一个网页朗读稿整理器。',
      `输出语言必须是 ${targetLanguage}。除非目标语言与页面语言不同，否则不要主动翻译术语。`,
      '请按输入顺序整理成适合收听的口语稿，不得新增事实、推断、开场白、总结或额外建议。',
      codeStrategy === 'skip' ? '遇到代码块时请直接跳过，不要输出任何代码相关段落。' : '代码块默认只解释作用，不逐字念原文。',
      'sourceBlockIds 只能填写输入 canonicalBlocks 里的 canonicalBlockIds。'
    ];
    if (structuredOutputs) {
      return [...sharedLines, '只输出严格匹配 schema 的 JSON，不要额外文本。'].join('\n');
    }

    return [
      ...sharedLines,
      '你必须只输出 JSON，格式为 {"segments":[{"sectionTitle":"","spokenText":"","sourceBlockIds":[],"kind":"main|code-summary|warning"}]}。'
    ].join('\n');
  }

  const sharedLines = [
    'You rewrite web documents into audio-friendly scripts.',
    `The output language must be ${targetLanguage}. Do not translate technical terms unless the requested target language differs from the page language.`,
    'Keep the original order and do not add facts, inferences, introductions, conclusions, or extra advice.',
    codeStrategy === 'skip' ? 'Skip code blocks entirely.' : 'For code blocks, explain the purpose instead of reading every token.',
    'sourceBlockIds must use values listed in canonicalBlockIds from the input canonicalBlocks only.'
  ];
  if (structuredOutputs) {
    return [...sharedLines, 'Return JSON only and match the schema exactly.'].join('\n');
  }

  return [
    ...sharedLines,
    'Return JSON only in the shape {"segments":[{"sectionTitle":"","spokenText":"","sourceBlockIds":[],"kind":"main|code-summary|warning"}]}.'
  ].join('\n');
}

function buildRewriteUserPayload(
  payload: RewriteRequestPayload,
  blocks: StructuredBlock[],
  chunkIndex: number,
  totalChunks: number
): Record<string, unknown> {
  const requestPayload: Record<string, unknown> = {
    requestId: payload.requestId,
    snapshotRevision: payload.snapshotRevision,
    targetLanguage: resolveTargetLanguage(payload),
    tone: payload.policy.tone,
    preserveFacts: payload.policy.preserveFacts,
    maxSegmentChars: payload.policy.maxSegmentChars ?? 220,
    codeStrategy: payload.policy.codeStrategy ?? 'summary',
    snapshot: {
      url: payload.snapshot.url,
      title: payload.snapshot.title,
      language: payload.snapshot.language
    },
    canonicalBlocks: blocks.map((block) => ({
      canonicalBlockIds: getRewriteBlockSourceIds(block),
      type: block.type,
      text: block.text,
      headingPath: block.headingPath || [],
      isWarningLike: Boolean(block.isWarningLike)
    }))
  };

  if (totalChunks > 1) {
    requestPayload.chunkIndex = chunkIndex;
    requestPayload.totalChunks = totalChunks;
  }

  return requestPayload;
}

export function buildLlmConnectivityRequest(
  provider: ProviderConfig,
  options: { structuredOutputs?: boolean } = {}
): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    model: provider.modelOrVoice,
    temperature: 0,
    max_tokens: 12,
    messages: [
      {
        role: 'user',
        content: '请只回复：OK'
      }
    ]
  };

  if (options.structuredOutputs) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'connectivity_probe',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'string' }
          },
          required: ['ok'],
          additionalProperties: false
        }
      }
    };
  }

  return {
    url: `${resolveLlmBaseUrl(provider.baseUrl)}/chat/completions`,
    init: {
      method: 'POST',
      headers: resolveHeaders(provider),
      body: JSON.stringify(body)
    }
  };
}

export function buildRewriteRequest(
  provider: ProviderConfig,
  payload: RewriteRequestPayload,
  options: {
    structuredOutputs: boolean;
    chunkIndex?: number;
    totalChunks?: number;
    blocks?: StructuredBlock[];
  }
): { url: string; init: RequestInit } {
  const rewriteBlocks =
    options.blocks ||
    prepareStructuredBlocksForRewrite(
      payload.policy.codeStrategy === 'skip'
        ? payload.canonicalBlocks.filter((block) => block.type !== 'code')
        : payload.canonicalBlocks
    );
  const targetLanguage = resolveTargetLanguage(payload);
  const body: Record<string, unknown> = {
    model: provider.modelOrVoice,
    temperature: provider.temperature ?? 0.3,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(targetLanguage, payload.policy.codeStrategy, options.structuredOutputs)
      },
      {
        role: 'user',
        content: JSON.stringify(buildRewriteUserPayload(payload, rewriteBlocks, options.chunkIndex ?? 1, options.totalChunks ?? 1))
      }
    ]
  };

  if (options.structuredOutputs) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'smart_script_segments',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sectionTitle: { type: 'string' },
                  spokenText: { type: 'string' },
                  sourceBlockIds: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1
                  },
                  kind: {
                    type: 'string',
                    enum: ['main', 'code-summary', 'warning']
                  }
                },
                required: ['sectionTitle', 'spokenText', 'sourceBlockIds', 'kind'],
                additionalProperties: false
              }
            }
          },
          required: ['segments'],
          additionalProperties: false
        }
      }
    };
  }

  return {
    url: `${resolveLlmBaseUrl(provider.baseUrl)}/chat/completions`,
    init: {
      method: 'POST',
      headers: resolveHeaders(provider),
      body: JSON.stringify(body)
    }
  };
}

function extractJsonText(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || content.trim();
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

function getCachedStructuredOutputSupport(provider: ProviderConfig): boolean | null {
  const cached = structuredOutputSupportCache.get(providerFingerprint(provider));
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.checkedAt > STRUCTURED_OUTPUT_CACHE_TTL_MS) {
    structuredOutputSupportCache.delete(providerFingerprint(provider));
    return null;
  }
  return cached.supported;
}

function setCachedStructuredOutputSupport(provider: ProviderConfig, supported: boolean): void {
  structuredOutputSupportCache.set(providerFingerprint(provider), {
    supported,
    checkedAt: Date.now()
  });
}

export function detectStructuredOutputSupportFromError(error: unknown): boolean | null {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes('response_format') ||
    message.includes('json_schema') ||
    message.includes('structured outputs') ||
    message.includes('not supported')
  ) {
    return false;
  }
  return null;
}

export function parseRewriteResponse(
  content: string,
  options: {
    allowedSourceBlockIds: string[];
    maxSegmentChars: number;
    sourceOrder: string[];
    blockIdAliasMap?: Record<string, string>;
  }
): SmartScriptSegment[] {
  const jsonText = extractJsonText(content);
  const parsed = JSON.parse(jsonText) as { segments?: SmartScriptSegment[] };
  if (!Array.isArray(parsed.segments)) {
    throw new Error('LLM 返回的格式不正确，缺少 segments 数组。');
  }
  return validateRewriteSegments(
    parsed.segments.map((segment, index) => ({
      id: `smart-segment-${index + 1}`,
      sectionTitle: String(segment.sectionTitle || ''),
      spokenText: String(segment.spokenText || ''),
      sourceBlockIds: Array.isArray(segment.sourceBlockIds) ? segment.sourceBlockIds.map(String) : [],
      kind: segment.kind
    })),
    options
  );
}

async function runRewriteRequest(
  provider: ProviderConfig,
  payload: RewriteRequestPayload,
  blocks: StructuredBlock[],
  fetcher: typeof fetch,
  signal: AbortSignal | undefined
): Promise<SmartScriptSegment[]> {
  const allowedIds = Array.from(new Set(blocks.flatMap((block) => getRewriteBlockSourceIds(block))));
  const sourceOrder = payload.canonicalBlocks.flatMap((block) => getRewriteBlockSourceIds(block));
  const blockIdAliasMap = Object.fromEntries(
    payload.canonicalBlocks.map((block) => [block.id, block.canonicalBlockId || block.sourceElementId])
  );
  const cachedSupport = getCachedStructuredOutputSupport(provider);
  const shouldTryStructuredOutputs = cachedSupport !== false;
  const request = buildRewriteRequest(provider, payload, {
    structuredOutputs: shouldTryStructuredOutputs,
    blocks
  });
  const init = signal ? { ...request.init, signal } : request.init;

  try {
    const response = await fetcher(request.url, init);
    if (!response.ok) {
      const details = await readErrorMessageOnce(response);
      const error = new Error(`LLM 请求失败（${response.status}）：${details}`);
      const structuredSupport = detectStructuredOutputSupportFromError(error);
      if (shouldTryStructuredOutputs && structuredSupport === false) {
        setCachedStructuredOutputSupport(provider, false);
        return runRewriteRequest(provider, payload, blocks, fetcher, signal);
      }
      throw error;
    }

    if (shouldTryStructuredOutputs) {
      setCachedStructuredOutputSupport(provider, true);
    }

    const data = await response.json();
    const content = readContentField(data?.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error('LLM 响应中没有可解析的内容。');
    }
    return parseRewriteResponse(content, {
      allowedSourceBlockIds: allowedIds,
      maxSegmentChars: payload.policy.maxSegmentChars ?? 220,
      sourceOrder,
      blockIdAliasMap
    });
  } catch (error) {
    const structuredSupport = detectStructuredOutputSupportFromError(error);
    if (shouldTryStructuredOutputs && structuredSupport === false) {
      setCachedStructuredOutputSupport(provider, false);
      return runRewriteRequest(provider, payload, blocks, fetcher, signal);
    }
    throw error;
  }
}

function reduceChunkedSegments(chunks: SmartScriptSegment[][]): SmartScriptSegment[] {
  const seen = new Set<string>();
  const merged: SmartScriptSegment[] = [];

  for (const chunkSegments of chunks) {
    for (const segment of chunkSegments) {
      const signature = `${segment.sectionTitle}::${segment.spokenText}`;
      if (segment.kind === 'warning' && seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      merged.push(segment);
    }
  }

  return merged;
}

export async function fetchRewriteSegments(
  provider: ProviderConfig,
  payload: RewriteRequestPayload,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SmartScriptSegment[]> {
  if (!provider.enabled || !provider.apiKeyStoredLocally.trim()) {
    throw new Error('未配置可用的 LLM 提供商。');
  }

  const filteredBlocks =
    payload.policy.codeStrategy === 'skip'
      ? payload.canonicalBlocks.filter((block) => block.type !== 'code')
      : payload.canonicalBlocks;
  const preparedBlocks = prepareStructuredBlocksForRewrite(filteredBlocks);
  const canonicalBlocks = normalizeStructuredBlocksForRewrite(preparedBlocks);
  const normalizedPayload = {
    ...payload,
    canonicalBlocks
  };

  const chunks = shouldUseMultiChunkRewrite(canonicalBlocks)
    ? buildRewriteChunks(canonicalBlocks, { softCharLimit: 1800, hardCharLimit: 2400 })
    : [{ id: 'chunk-1', blocks: canonicalBlocks, charCount: canonicalBlocks.reduce((sum, block) => sum + block.text.length, 0) }];

  const chunkResults: SmartScriptSegment[][] = [];
  for (const chunk of chunks) {
    chunkResults.push(await runRewriteRequest(provider, normalizedPayload, chunk.blocks, fetcher, signal));
  }

  return reduceChunkedSegments(chunkResults);
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
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RemoteAudioPayload> {
  if (!provider.enabled || !provider.apiKeyStoredLocally.trim()) {
    throw new Error('未配置可用的远端 TTS 提供商。');
  }
  const adapter = getTtsProviderAdapter(provider.providerId);
  const request = adapter.buildSynthesisRequest(provider, text, options);
  const response = await fetcher(request.url, signal ? { ...request.init, signal } : request.init);

  if (!response.ok) {
    const details = await readErrorMessageOnce(response);
    throw new Error(`TTS 请求失败（${response.status}）：${details}`);
  }
  return adapter.parseSynthesisResponse(response, {
    provider,
    fetcher
  });
}

async function probeStructuredOutputs(provider: ProviderConfig, fetcher: typeof fetch): Promise<boolean> {
  const request = buildLlmConnectivityRequest(provider, { structuredOutputs: true });
  const response = await fetcher(request.url, request.init);
  if (!response.ok) {
    const details = await readErrorMessageOnce(response);
    const support = detectStructuredOutputSupportFromError(details);
    if (support === false) {
      return false;
    }
    throw new Error(`LLM 连通性测试失败（${response.status}）：${details}`);
  }

  const data = await response.json();
  const content = readContentField(data?.choices?.[0]?.message?.content);
  if (!content.trim()) {
    throw new Error('LLM 连通性测试失败：响应为空。');
  }
  return true;
}

export async function testProviderConnectivity(
  providerKind: 'llm' | 'tts',
  loadSettingsFn: () => Promise<{ providers: { llm: ProviderConfig; tts: ProviderConfig } }> = async () =>
    (await import('@/lib/storage/settings')).loadSettings(),
  fetcher: typeof fetch = fetch
): Promise<ProviderTestResult> {
  try {
    const settings = await loadSettingsFn();
    const provider = providerKind === 'llm' ? settings.providers.llm : settings.providers.tts;

    if (!provider.enabled || !provider.baseUrl.trim() || !provider.modelOrVoice.trim() || !provider.apiKeyStoredLocally.trim()) {
      throw new Error(providerKind === 'llm' ? '请先完整配置并启用 LLM 提供商。' : '请先完整配置并启用 TTS 提供商。');
    }

    if (providerKind === 'llm') {
      const supportsStructuredOutputs = await probeStructuredOutputs(provider, fetcher).catch((error) => {
        const supported = detectStructuredOutputSupportFromError(error);
        if (supported === false) {
          return false;
        }
        throw error;
      });
      setCachedStructuredOutputSupport(provider, supportsStructuredOutputs);

      const request = buildLlmConnectivityRequest(provider);
      const response = await fetcher(request.url, request.init);
      if (!response.ok) {
        const details = await readErrorMessageOnce(response);
        throw new Error(`LLM 连通性测试失败（${response.status}）：${details}`);
      }
      const data = await response.json();
      const content = readContentField(data?.choices?.[0]?.message?.content);
      if (!content.trim()) {
        throw new Error('LLM 连通性测试失败：响应为空。');
      }

      const notice = buildSuccessNotice('智能整理已连通', '现在可以整理网页内容了。', '回到播放器后可以直接试试“智能整理”。');
      return {
        ...noticeToProviderTestResult(providerKind, notice, true),
        supportsStructuredOutputs
      };
    }

    const request = getTtsProviderAdapter(provider.providerId).buildConnectivityRequest(provider);
    const response = await fetcher(request.url, request.init);
    if (!response.ok) {
      const details = await readErrorMessageOnce(response);
      throw new Error(`TTS 连通性测试失败（${response.status}）：${details}`);
    }

    const audio = await getTtsProviderAdapter(provider.providerId).parseSynthesisResponse(response, {
      provider,
      fetcher
    });
    if (!audio.mediaUrl && !audio.base64Audio) {
      throw new Error('TTS 连通性测试失败：返回了空音频。');
    }

    return noticeToProviderTestResult(
      providerKind,
      buildSuccessNotice('声音服务已连通', '现在可以直接试听并开始收听。', '下一步可以点击“试听一下”确认声音效果。'),
      true
    );
  } catch (error) {
    return noticeToProviderTestResult(providerKind, mapErrorToNotice(error, { surface: 'options', action: 'test-provider' }), false);
  }
}
