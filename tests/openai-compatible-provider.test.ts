import { describe, expect, test } from 'vitest';

import {
  buildRewriteRequest,
  parseRewriteResponse,
  buildRemoteTtsRequest,
  selectBlocksForRewrite
} from '@/lib/providers/openaiCompatible';
import type { ProviderConfig, StructuredBlock } from '@/lib/shared/types';

const provider: ProviderConfig = {
  providerId: 'openai-compatible',
  kind: 'llm',
  enabled: true,
  baseUrl: 'https://example.com/v1',
  modelOrVoice: 'gpt-4.1-mini',
  apiKeyStoredLocally: 'secret-key'
};

const blocks: StructuredBlock[] = [
  {
    id: 'paragraph-1',
    type: 'paragraph',
    text: '先安装 Bun，再初始化项目目录。',
    sourceElementId: 'catchyread-1'
  }
];

describe('openaiCompatible provider helpers', () => {
  test('构造轻改写请求体，明确要求返回 JSON 段落', () => {
    const request = buildRewriteRequest(provider, blocks, {
      preserveFacts: true,
      tone: 'podcast-lite'
    });

    expect(request.url).toBe('https://example.com/v1/chat/completions');
    expect(request.init.headers).toMatchObject({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json'
    });
    expect(String(request.init.body)).toContain('sourceBlockIds');
    expect(String(request.init.body)).toContain('podcast-lite');
    expect(String(request.init.body)).not.toContain('response_format');
  });

  test('解析 JSON fenced code block 响应', () => {
    const segments = parseRewriteResponse(
      '```json\n{"segments":[{"id":"seg-1","sectionTitle":"准备","spokenText":"先装好 Bun，然后初始化项目。","sourceBlockIds":["paragraph-1"],"kind":"main"}]}\n```'
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.spokenText).toContain('先装好 Bun');
    expect(segments[0]?.sourceBlockIds).toEqual(['paragraph-1']);
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

  test('长网页会按字符预算裁剪重写输入', () => {
    const selected = selectBlocksForRewrite(
      Array.from({ length: 12 }, (_, index) => ({
        id: `paragraph-${index + 1}`,
        type: 'paragraph' as const,
        text: `第 ${index + 1} 段：${'A'.repeat(300)}`,
        sourceElementId: `catchyread-${index + 1}`
      })),
      1100
    );

    const totalChars = selected.reduce((sum, item) => sum + item.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(1100);
    expect(selected.length).toBeLessThan(12);
    expect(selected[0]?.id).toBe('paragraph-1');
  });
});
