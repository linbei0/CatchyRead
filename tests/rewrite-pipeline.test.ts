import { describe, expect, test } from 'vitest';

import {
  buildRewriteChunks,
  normalizeStructuredBlocksForRewrite,
  prepareStructuredBlocksForRewrite,
  getRewriteBlockSourceIds,
  shouldUseMultiChunkRewrite
} from '@/domain/content/rewrite-pipeline';
import type { PageSnapshot, StructuredBlock } from '@/shared/types';

function createBlock(partial: Partial<StructuredBlock> & Pick<StructuredBlock, 'id' | 'type' | 'text' | 'sourceElementId'>): StructuredBlock {
  return {
    canonicalBlockId: partial.sourceElementId,
    headingPath: [],
    priority: 'normal',
    isWarningLike: false,
    ...partial
  };
}

describe('rewrite pipeline helpers', () => {
  test('复杂页面会触发多块整理策略', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com/long',
      title: 'Long article',
      language: 'en-US',
      capturedAt: '2026-04-04T00:00:00.000Z',
      structuredBlocks: Array.from({ length: 13 }, (_, index) =>
        createBlock({
          id: `p-${index + 1}`,
          type: 'paragraph',
          text: `段落 ${index + 1}：${'A'.repeat(120)}`,
          sourceElementId: `catchyread-${index + 1}`
        })
      )
    };

    expect(shouldUseMultiChunkRewrite(snapshot.structuredBlocks)).toBe(true);
  });

  test('会拆分超长首块并保留尾部 warning 块', () => {
    const blocks = normalizeStructuredBlocksForRewrite([
      createBlock({
        id: 'intro',
        type: 'paragraph',
        text: `第一段 ${'A'.repeat(2600)}`,
        sourceElementId: 'catchyread-1',
        headingPath: ['Intro']
      }),
      createBlock({
        id: 'warning',
        type: 'note',
        text: 'Warning: keep your API key secret.',
        sourceElementId: 'catchyread-2',
        headingPath: ['Warnings'],
        isWarningLike: true,
        priority: 'critical'
      })
    ]);

    const chunks = buildRewriteChunks(blocks, {
      softCharLimit: 1800,
      hardCharLimit: 2400
    });

    expect(blocks.every((block) => block.text.length <= 2400)).toBe(true);
    expect(chunks.flatMap((chunk) => chunk.blocks.map((block) => block.canonicalBlockId))).toContain('catchyread-2');
    expect(chunks[chunks.length - 1]?.blocks.some((block) => block.isWarningLike)).toBe(true);
  });

  test('会移除标题、合并连续列表、清洗代码噪音并合并相邻重复块', () => {
    const blocks = prepareStructuredBlocksForRewrite([
      createBlock({
        id: 'heading-1',
        type: 'heading',
        text: '第一章',
        sourceElementId: 'catchyread-1',
        headingPath: ['第一章']
      }),
      createBlock({
        id: 'quote-1',
        type: 'quote',
        text: '这是一段重复内容。',
        sourceElementId: 'catchyread-2',
        headingPath: ['第一章']
      }),
      createBlock({
        id: 'paragraph-1',
        type: 'paragraph',
        text: '这是一段重复内容。',
        sourceElementId: 'catchyread-3',
        headingPath: ['第一章']
      }),
      createBlock({
        id: 'list-1',
        type: 'list',
        text: '第一点：先装依赖',
        sourceElementId: 'catchyread-4',
        headingPath: ['第一章']
      }),
      createBlock({
        id: 'list-2',
        type: 'list',
        text: '第二点：配置参数',
        sourceElementId: 'catchyread-5',
        headingPath: ['第一章']
      }),
      createBlock({
        id: 'code-1',
        type: 'code',
        text: 'xml 体验AI代码助手 代码解读复制代码<dependency>demo</dependency>',
        sourceElementId: 'catchyread-6',
        headingPath: ['第一章']
      })
    ]);

    expect(blocks.map((block) => block.type)).toEqual(['quote', 'list', 'code']);
    expect(getRewriteBlockSourceIds(blocks[0]!)).toEqual(['catchyread-2', 'catchyread-3']);
    expect(getRewriteBlockSourceIds(blocks[1]!)).toEqual(['catchyread-4', 'catchyread-5']);
    expect(blocks[1]?.text).toContain('第一点：先装依赖');
    expect(blocks[1]?.text).toContain('第二点：配置参数');
    expect(blocks[2]?.text).not.toContain('体验AI代码助手');
    expect(blocks[2]?.text).not.toContain('代码解读');
    expect(blocks[2]?.text).not.toContain('复制代码');
  });
});
