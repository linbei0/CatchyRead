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
      snapshot: { title: string; siteName: string };
      targetLanguage: string;
      canonicalBlocks: Array<{ canonicalBlockId: string }>;
    };

    expect(request.url).toBe('https://example.com/v1/chat/completions');
    expect(request.init.headers).toMatchObject({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json'
    });
    expect(userContent.requestId).toBe('req-1');
    expect(userContent.snapshotRevision).toBe(3);
    expect(userContent.snapshot.title).toBe('How to build a browser extension');
    expect(userContent.snapshot.siteName).toBe('Example Docs');
    expect(userContent.targetLanguage).toBe('en-US');
    expect(userContent.canonicalBlocks[0]?.canonicalBlockId).toBe('catchyread-1');
    expect(String(request.init.body)).toContain('"response_format"');
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
