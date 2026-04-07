import { describe, expect, test } from 'vitest';

import { assessPageSupport } from '@/domain/content/page-support';
import type { PageSnapshot, StructuredBlock } from '@/shared/types';

function createSnapshot(blocks: StructuredBlock[]): PageSnapshot {
  return {
    url: 'https://example.com/doc',
    title: 'Doc',
    language: 'zh-CN',
    capturedAt: '2026-04-07T00:00:00.000Z',
    structuredBlocks: blocks
  };
}

describe('assessPageSupport', () => {
  test('正文不足时标记为当前不支持', () => {
    const result = assessPageSupport(createSnapshot([]));

    expect(result.status).toBe('unsupported');
    expect(result.label).toBe('当前不支持');
  });

  test('代码和表格密度很高时建议优先使用原文模式', () => {
    const blocks: StructuredBlock[] = [
      {
        id: 'heading-1',
        type: 'heading',
        text: 'CLI 速查表',
        sourceElementId: 'block-1'
      },
      {
        id: 'code-1',
        type: 'code',
        text: 'pnpm install\npnpm build\npnpm test',
        sourceElementId: 'block-2',
        metadata: { language: 'bash' }
      },
      {
        id: 'code-2',
        type: 'code',
        text: 'export interface BuildOptions {\n  watch?: boolean;\n}',
        sourceElementId: 'block-3',
        metadata: { language: 'ts' }
      },
      {
        id: 'table-1',
        type: 'table',
        text: '命令 | 作用\npnpm build | 生产构建',
        sourceElementId: 'block-4',
        metadata: { columnCount: 2, rowCount: 2 }
      }
    ];

    const result = assessPageSupport(createSnapshot(blocks));

    expect(result.status).toBe('prefer-original');
    expect(result.reason).toContain('代码');
  });

  test('包含复杂结构但仍可播放时标记为部分支持', () => {
    const blocks: StructuredBlock[] = [
      {
        id: 'heading-1',
        type: 'heading',
        text: 'Vite 部署说明',
        sourceElementId: 'block-1'
      },
      {
        id: 'paragraph-1',
        type: 'paragraph',
        text: '先在控制台里设置环境变量，再执行部署命令。',
        sourceElementId: 'block-2'
      },
      {
        id: 'table-1',
        type: 'table',
        text: '环境 | 地址\n生产 | app.example.com',
        sourceElementId: 'block-3',
        metadata: { columnCount: 2, rowCount: 2 }
      }
    ];

    const result = assessPageSupport(createSnapshot(blocks));

    expect(result.status).toBe('partial-support');
    expect(result.label).toBe('部分支持');
  });

  test('正文结构清晰时标记为完全支持', () => {
    const blocks: StructuredBlock[] = [
      {
        id: 'heading-1',
        type: 'heading',
        text: '如何用 Bun 构建 CLI',
        sourceElementId: 'block-1'
      },
      {
        id: 'paragraph-1',
        type: 'paragraph',
        text: '这篇教程会带你从零开始搭一个命令行工具，并解释每个关键步骤的原因。',
        sourceElementId: 'block-2'
      },
      {
        id: 'paragraph-2',
        type: 'paragraph',
        text: '你会先初始化项目，再安装 commander，并补上构建和测试命令。',
        sourceElementId: 'block-3'
      }
    ];

    const result = assessPageSupport(createSnapshot(blocks));

    expect(result.status).toBe('fully-supported');
    expect(result.label).toBe('完全支持');
  });
});
