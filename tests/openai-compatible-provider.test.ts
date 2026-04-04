import { describe, expect, test } from 'vitest';

import {
  buildRewriteRequest,
  parseRewriteResponse,
  buildRemoteTtsRequest,
  detectStructuredOutputSupportFromError
} from '@/lib/providers/openaiCompatible';
import type { PageSnapshot, ProviderConfig, RewriteRequestPayload, StructuredBlock } from '@/shared/types';

const provider: ProviderConfig = {
  providerId: 'openai-compatible',
  kind: 'llm',
  enabled: true,
  baseUrl: 'https://example.com/v1',
  modelOrVoice: 'gpt-4.1-mini',
  apiKeyStoredLocally: 'secret-key'
};

const canonicalBlocks: StructuredBlock[] = [
  {
    id: 'paragraph-1',
    canonicalBlockId: 'catchyread-1',
    type: 'paragraph',
    text: '先安装 Bun，再初始化项目目录。',
    sourceElementId: 'catchyread-1',
    headingPath: ['准备'],
    priority: 'normal',
    isWarningLike: false
  },
  {
    id: 'warning-1',
    canonicalBlockId: 'catchyread-2',
    type: 'note',
    text: '注意：不要把 API Key 提交到仓库。',
    sourceElementId: 'catchyread-2',
    headingPath: ['准备', '风险提醒'],
    priority: 'critical',
    isWarningLike: true
  },
  {
    id: 'code-1',
    canonicalBlockId: 'catchyread-3',
    type: 'code',
    text: 'bun init\nbun add commander',
    sourceElementId: 'catchyread-3',
    headingPath: ['准备'],
    priority: 'supporting',
    isWarningLike: false,
    metadata: {
      language: 'bash'
    }
  }
];

const snapshot: PageSnapshot = {
  url: 'https://example.com/tutorial',
  title: 'How to build a browser extension',
  language: 'en-US',
  capturedAt: '2026-04-04T00:00:00.000Z',
  excerpt: 'Build a browser extension from scratch.',
  siteName: 'Example Docs',
  byline: 'CatchyRead Team',
  structuredBlocks: canonicalBlocks
};

function buildPayload(overrides?: Partial<RewriteRequestPayload>): RewriteRequestPayload {
  return {
    snapshot,
    canonicalBlocks,
    requestId: 'req-1',
    snapshotRevision: 3,
    policy: {
      preserveFacts: true,
      tone: 'podcast-lite',
      maxSegmentChars: 220,
      outputLanguage: 'follow-page',
      uiLanguage: 'zh-CN'
    },
    ...overrides
  };
}

describe('openaiCompatible provider helpers', () => {
  test('构造改写请求时会注入页面元数据、请求标识与目标语言', () => {
    const request = buildRewriteRequest(provider, buildPayload(), { structuredOutputs: true });
    const rawBody = JSON.parse(String(request.init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = JSON.parse(String(rawBody.messages.find((message) => message.role === 'user')?.content || '{}')) as {
      requestId: string;
      snapshotRevision: number;
      snapshot: { title: string; language: string };
      targetLanguage: string;
      canonicalBlocks: Array<{ canonicalBlockIds: string[] }>;
    };

    expect(request.url).toBe('https://example.com/v1/chat/completions');
    expect(request.init.headers).toMatchObject({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json'
    });
    expect(userContent.requestId).toBe('req-1');
    expect(userContent.snapshotRevision).toBe(3);
    expect(userContent.snapshot.title).toBe('How to build a browser extension');
    expect(userContent.snapshot.language).toBe('en-US');
    expect(userContent.targetLanguage).toBe('en-US');
    expect(userContent.canonicalBlocks[0]?.canonicalBlockIds).toEqual(['catchyread-1']);
    expect(String(request.init.body)).toContain('"response_format"');
  });

  test('构造结构化改写请求时会精简 prompt 与 payload 以减少 token', () => {
    const request = buildRewriteRequest(
      provider,
      buildPayload({
        policy: {
          ...buildPayload().policy,
          outputLanguage: 'explicit-locale',
          outputLocale: 'zh-CN'
        }
      }),
      { structuredOutputs: true }
    );
    const rawBody = JSON.parse(String(request.init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemContent = String(rawBody.messages.find((message) => message.role === 'system')?.content || '');
    const userContent = JSON.parse(String(rawBody.messages.find((message) => message.role === 'user')?.content || '{}')) as {
      chunkIndex?: number;
      totalChunks?: number;
      canonicalBlocks: Array<Record<string, unknown>>;
    };

    expect(systemContent).toContain('只输出严格匹配 schema 的 JSON');
    expect(systemContent).not.toContain('格式为 {"segments"');
    expect('chunkIndex' in userContent).toBe(false);
    expect('totalChunks' in userContent).toBe(false);
    expect('id' in (userContent.canonicalBlocks[0] || {})).toBe(false);
    expect('priority' in (userContent.canonicalBlocks[0] || {})).toBe(false);
  });

  test('多块改写请求仍会保留必要的分块元数据', () => {
    const request = buildRewriteRequest(provider, buildPayload(), {
      structuredOutputs: true,
      chunkIndex: 2,
      totalChunks: 3
    });
    const rawBody = JSON.parse(String(request.init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = JSON.parse(String(rawBody.messages.find((message) => message.role === 'user')?.content || '{}')) as {
      chunkIndex?: number;
      totalChunks?: number;
    };

    expect(userContent.chunkIndex).toBe(2);
    expect(userContent.totalChunks).toBe(3);
  });

  test('构造改写请求时会预处理块并压缩 snapshot 与 schema', () => {
    const requestBlocks: StructuredBlock[] = [
      {
        id: 'heading-1',
        canonicalBlockId: 'catchyread-h1',
        type: 'heading',
        text: '准备',
        sourceElementId: 'catchyread-h1',
        headingPath: ['准备'],
        priority: 'supporting',
        isWarningLike: false
      },
      {
        id: 'quote-1',
        canonicalBlockId: 'catchyread-q1',
        type: 'quote',
        text: '这是一段重复内容。',
        sourceElementId: 'catchyread-q1',
        headingPath: ['准备'],
        priority: 'normal',
        isWarningLike: false
      },
      {
        id: 'paragraph-1',
        canonicalBlockId: 'catchyread-p1',
        type: 'paragraph',
        text: '这是一段重复内容。',
        sourceElementId: 'catchyread-p1',
        headingPath: ['准备'],
        priority: 'normal',
        isWarningLike: false
      },
      {
        id: 'list-1',
        canonicalBlockId: 'catchyread-l1',
        type: 'list',
        text: '第一点：先装依赖',
        sourceElementId: 'catchyread-l1',
        headingPath: ['准备'],
        priority: 'supporting',
        isWarningLike: false
      },
      {
        id: 'list-2',
        canonicalBlockId: 'catchyread-l2',
        type: 'list',
        text: '第二点：配置参数',
        sourceElementId: 'catchyread-l2',
        headingPath: ['准备'],
        priority: 'supporting',
        isWarningLike: false
      },
      {
        id: 'code-1',
        canonicalBlockId: 'catchyread-c1',
        type: 'code',
        text: 'xml 体验AI代码助手 代码解读复制代码<dependency>demo</dependency>',
        sourceElementId: 'catchyread-c1',
        headingPath: ['准备'],
        priority: 'normal',
        isWarningLike: false
      }
    ];
    const request = buildRewriteRequest(
      provider,
      buildPayload({
        canonicalBlocks: requestBlocks,
        snapshot: {
          ...snapshot,
          excerpt: '这段摘要不应该继续发送。',
          byline: '这段署名也不应该继续发送。'
        }
      }),
      { structuredOutputs: true }
    );
    const rawBody = JSON.parse(String(request.init.body)) as {
      messages: Array<{ role: string; content: string }>;
      response_format: {
        json_schema: {
          schema: {
            properties: {
              segments: {
                items: {
                  required: string[];
                };
              };
            };
          };
        };
      };
    };
    const userContent = JSON.parse(String(rawBody.messages.find((message) => message.role === 'user')?.content || '{}')) as {
      snapshot: Record<string, unknown>;
      canonicalBlocks: Array<Record<string, unknown>>;
    };

    expect(userContent.snapshot).toEqual({
      url: 'https://example.com/tutorial',
      title: 'How to build a browser extension',
      language: 'en-US'
    });
    expect(userContent.canonicalBlocks.map((block) => block.type)).toEqual(['quote', 'list', 'code']);
    expect(userContent.canonicalBlocks[0]?.canonicalBlockIds).toEqual(['catchyread-q1', 'catchyread-p1']);
    expect(userContent.canonicalBlocks[1]?.canonicalBlockIds).toEqual(['catchyread-l1', 'catchyread-l2']);
    expect(String(userContent.canonicalBlocks[2]?.text || '')).not.toContain('体验AI代码助手');
    expect(String(userContent.canonicalBlocks[2]?.text || '')).not.toContain('代码解读');
    expect(String(userContent.canonicalBlocks[2]?.text || '')).not.toContain('复制代码');
    expect(rawBody.response_format.json_schema.schema.properties.segments.items.required).not.toContain('id');
  });

  test('DashScope Base URL 会自动切到兼容聊天路径', () => {
    const request = buildRewriteRequest(
      {
        ...provider,
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
      },
      buildPayload(),
      { structuredOutputs: false }
    );

    expect(request.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  test('解析 JSON fenced code block 响应时只接受真实 canonical block id', () => {
    const segments = parseRewriteResponse(
      '```json\n{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"先装好 Bun，然后初始化项目。","sourceBlockIds":["catchyread-1"],"kind":"main"}]}\n```',
      {
        allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
        maxSegmentChars: 220,
        sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId)
      }
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.spokenText).toContain('先装好 Bun');
    expect(segments[0]?.sourceBlockIds).toEqual(['catchyread-1']);
  });

  test('解析响应时拒绝未知 block id 与空 spokenText', () => {
    expect(() =>
      parseRewriteResponse(
        '{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"","sourceBlockIds":["paragraph-1"],"kind":"main"}]}',
        {
          allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
          maxSegmentChars: 220,
          sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId)
        }
      )
    ).toThrow('smart segment');

    expect(() =>
      parseRewriteResponse(
        '{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"hello","sourceBlockIds":["paragraph-1"],"kind":"main"}]}',
        {
          allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
          maxSegmentChars: 220,
          sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId)
        }
      )
    ).toThrow('sourceBlockIds');
  });

  test('解析响应时会把旧 block id 保守映射为 canonical block id', () => {
    const segments = parseRewriteResponse(
      '{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"先装好 Bun，然后初始化项目。","sourceBlockIds":["paragraph-1"],"kind":"main"}]}',
      {
        allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
        maxSegmentChars: 220,
        sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
        blockIdAliasMap: Object.fromEntries(
          canonicalBlocks.map((block) => [block.id, block.canonicalBlockId || block.sourceElementId])
        )
      }
    );

    expect(segments[0]?.sourceBlockIds).toEqual(['catchyread-1']);
  });

  test('解析响应时会把超长 spokenText 自动拆成多个可播放段', () => {
    const longText = `第一句解释问题。第二句继续展开。${'A'.repeat(260)}`;
    const segments = parseRewriteResponse(
      `{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"${longText}","sourceBlockIds":["catchyread-1"],"kind":"main"}]}`,
      {
        allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
        maxSegmentChars: 120,
        sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId)
      }
    );

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.spokenText.length <= 120)).toBe(true);
    expect(segments.every((segment) => segment.sourceBlockIds[0] === 'catchyread-1')).toBe(true);
  });

  test('解析响应时会为缺失 id 的段落本地生成编号', () => {
    const segments = parseRewriteResponse(
      '{"segments":[{"sectionTitle":"准备","spokenText":"先装好 Bun，然后初始化项目。","sourceBlockIds":["catchyread-1"],"kind":"main"}]}',
      {
        allowedSourceBlockIds: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId),
        maxSegmentChars: 220,
        sourceOrder: canonicalBlocks.map((block) => block.canonicalBlockId || block.sourceElementId)
      }
    );

    expect(segments[0]?.id).toBe('smart-segment-1');
  });

  test('构造远端 TTS 请求', () => {
    const request = buildRemoteTtsRequest(
      {
        providerId: 'openai-tts',
        kind: 'tts',
        enabled: true,
        baseUrl: 'https://example.com/v1',
        modelOrVoice: 'tts-1',
        apiKeyStoredLocally: 'tts-secret'
      },
      '你好，欢迎来到 CatchyRead。',
      {
        voiceId: 'alloy',
        rate: 1.1
      }
    );

    expect(request.url).toBe('https://example.com/v1/audio/speech');
    expect(String(request.init.body)).toContain('"voice":"alloy"');
    expect(String(request.init.body)).toContain('"speed":1.1');
  });

  test('不支持结构化输出的错误会被识别为兼容模式信号', () => {
    expect(detectStructuredOutputSupportFromError(new Error('response_format.json_schema is not supported'))).toBe(false);
    expect(detectStructuredOutputSupportFromError(new Error('something else'))).toBeNull();
  });
});
