import { describe, expect, test } from 'vitest';

import { buildSpokenSegments } from '@/lib/extract/blockProcessing';
import type { StructuredBlock } from '@/lib/shared/types';

const blocks: StructuredBlock[] = [
  {
    id: 'heading-1',
    type: 'heading',
    text: '如何用 Bun 构建 CLI',
    sourceElementId: 'catchyread-1',
    level: 1
  },
  {
    id: 'paragraph-1',
    type: 'paragraph',
    text: '这篇教程会带你从零开始搭一个命令行工具。',
    sourceElementId: 'catchyread-2'
  },
  {
    id: 'code-1',
    type: 'code',
    text: 'bun init\nbun add commander',
    sourceElementId: 'catchyread-3',
    metadata: {
      language: 'bash'
    }
  }
];

describe('buildSpokenSegments', () => {
  test('默认把代码块整理为摘要朗读', () => {
    const segments = buildSpokenSegments(blocks, {
      mode: 'original',
      codeStrategy: 'summary'
    });

    expect(segments).toHaveLength(3);
    expect(segments[2]?.kind).toBe('code-summary');
    expect(segments[2]?.spokenText).toContain('命令行代码');
    expect(segments[2]?.spokenText).not.toContain('bun add commander');
  });

  test('切换为原文代码模式后保留原始代码内容', () => {
    const segments = buildSpokenSegments(blocks, {
      mode: 'original',
      codeStrategy: 'full'
    });

    expect(segments[2]?.spokenText).toContain('bun add commander');
    expect(segments[2]?.kind).toBe('main');
  });

  test('切换为跳过代码后不生成代码段落', () => {
    const segments = buildSpokenSegments(blocks, {
      mode: 'original',
      codeStrategy: 'skip'
    });

    expect(segments).toHaveLength(2);
    expect(segments.some((segment) => segment.sourceBlockIds.includes('catchyread-3'))).toBe(false);
  });

  test('当块携带 canonicalBlockIds 元数据时会保留全部 sourceBlockIds', () => {
    const segments = buildSpokenSegments(
      [
      {
        id: 'paragraph-merged',
        type: 'paragraph',
        text: '这是合并后的回退段落。',
        sourceElementId: 'catchyread-merged',
          headingPath: ['准备'],
          metadata: {
            canonicalBlockIds: ['catchyread-2', 'catchyread-3']
          }
        }
      ],
      {
        mode: 'original',
        codeStrategy: 'summary'
      }
    );

    expect(segments[0]?.sourceBlockIds).toEqual(['catchyread-2', 'catchyread-3']);
  });

  test('表格块会整理成适合听读的摘要', () => {
    const segments = buildSpokenSegments(
      [
        {
          id: 'table-1',
          type: 'table',
          text: '命令 | 作用\npnpm dev | 本地开发\npnpm build | 生产构建',
          sourceElementId: 'catchyread-4',
          metadata: {
            columnCount: 2,
            rowCount: 3
          }
        }
      ],
      {
        mode: 'original',
        codeStrategy: 'summary'
      }
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.spokenText).toContain('表格');
    expect(segments[0]?.spokenText).toContain('2 列');
    expect(segments[0]?.spokenText).toContain('3 行');
  });

  test('API 签名代码块会优先说明接口作用而不是按字符朗读', () => {
    const segments = buildSpokenSegments(
      [
        {
          id: 'code-2',
          type: 'code',
          text: 'export interface BuildOptions {\n  watch?: boolean;\n  minify?: boolean;\n}',
          sourceElementId: 'catchyread-5',
          metadata: {
            language: 'ts'
          }
        }
      ],
      {
        mode: 'original',
        codeStrategy: 'summary'
      }
    );

    expect(segments[0]?.spokenText).toContain('API');
    expect(segments[0]?.spokenText).not.toContain('watch?: boolean');
  });

  test('列表项朗读时不再使用生硬的固定前缀', () => {
    const segments = buildSpokenSegments(
      [
        {
          id: 'list-1',
          type: 'list',
          text: '先安装依赖，再执行构建命令。',
          sourceElementId: 'catchyread-6'
        }
      ],
      {
        mode: 'original',
        codeStrategy: 'summary'
      }
    );

    expect(segments[0]?.spokenText).toBe('先安装依赖，再执行构建命令。');
    expect(segments[0]?.spokenText).not.toContain('列表项');
  });
});
