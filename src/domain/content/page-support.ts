import type { PageSnapshot, PageSupportStatus, StructuredBlock } from '@/shared/types';

export interface PageSupportAssessment {
  status: PageSupportStatus;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
  reason: string;
}

function sumTextLength(blocks: StructuredBlock[]): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}

function countBlocks(blocks: StructuredBlock[], type: StructuredBlock['type']): number {
  return blocks.filter((block) => block.type === type).length;
}

export function assessPageSupport(snapshot: PageSnapshot): PageSupportAssessment {
  const bodyBlocks = snapshot.structuredBlocks.filter((block) => block.type !== 'heading');
  const totalChars = sumTextLength(bodyBlocks);
  const codeBlocks = countBlocks(bodyBlocks, 'code');
  const tableBlocks = countBlocks(bodyBlocks, 'table');
  const codeChars = sumTextLength(bodyBlocks.filter((block) => block.type === 'code'));

  if (bodyBlocks.length === 0 || totalChars < 24) {
    return {
      status: 'unsupported',
      label: '当前不支持',
      tone: 'danger',
      reason: '这一页没有识别到足够稳定的正文结构，建议换到正文更完整的页面再试。'
    };
  }

  if (codeBlocks >= 2 && codeChars / Math.max(totalChars, 1) >= 0.4) {
    return {
      status: 'prefer-original',
      label: '建议原文模式',
      tone: 'warning',
      reason: '这一页的代码和接口片段占比很高，建议优先用原文模式避免智能整理过度概括。'
    };
  }

  if (tableBlocks > 0 || codeBlocks > 0) {
    return {
      status: 'partial-support',
      label: '部分支持',
      tone: 'warning',
      reason: '这一页包含表格、代码或复杂结构，整体可听，但个别段落可能更适合手动定位。'
    };
  }

  return {
    status: 'fully-supported',
    label: '完全支持',
    tone: 'success',
    reason: '正文结构清晰，适合直接连续收听。'
  };
}
