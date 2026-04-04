import { describe, expect, test } from 'vitest';

import {
  buildRewriteChunks,
  normalizeStructuredBlocksForRewrite,
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
});
