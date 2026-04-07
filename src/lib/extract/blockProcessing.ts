import type { SegmentBuildOptions, SmartScriptSegment, StructuredBlock } from '@/lib/shared/types';

const SENTENCE_SPLIT = /(?<=[。！？!?\.])\s+/;

function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';
  for (const sentence of text.split(SENTENCE_SPLIT)) {
    if (!sentence) {
      continue;
    }
    if ((current + sentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += `${current ? ' ' : ''}${sentence}`;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length ? chunks : [text];
}

function summarizeCodeBlock(block: StructuredBlock): string {
  const lines = block.text.split('\n').map((line) => line.trim()).filter(Boolean);
  const apiSignature = lines[0]?.match(/^(export\s+)?(async\s+)?(interface|type|class|function|const)\s+([A-Za-z0-9_$]+)/i);
  if (apiSignature) {
    const keyword = apiSignature[3];
    const name = apiSignature[4];
    const languageLabel = block.metadata?.language ? `${block.metadata.language.toUpperCase()} ` : '';
    return `这是一段 ${languageLabel}API 签名，重点是在说明 ${name} 这个${keyword}的接口结构与可选项。默认不逐字段朗读，避免打断理解节奏。`;
  }

  const commandNames = lines
    .slice(0, 3)
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean)
    .join('、');

  if (block.metadata?.language === 'bash' || lines.every((line) => /^[a-z0-9._/-]+(\s|$)/i.test(line))) {
    return `这是一段命令行代码，主要是在执行 ${commandNames || '若干命令'} 这类步骤。默认不逐字朗读参数，避免把注意力浪费在长串命令上。`;
  }

  const languageLabel = block.metadata?.language ? `${block.metadata.language} ` : '';
  return `这是一段 ${languageLabel}代码，主要作用是展示一个实现片段或配置写法。默认只朗读作用与上下文，需要时可切换到原文精读。`;
}

function summarizeTableBlock(block: StructuredBlock): string {
  const columnCount = block.metadata?.columnCount || block.text.split('\n')[0]?.split('|').length || 0;
  const rowCount = block.metadata?.rowCount || block.text.split('\n').filter(Boolean).length;
  return `这是一张表格，共 ${columnCount} 列、${rowCount} 行，适合先听整体结构，再按需回到原文查看具体单元格内容。`;
}

function inferSegmentKind(block: StructuredBlock): SmartScriptSegment['kind'] {
  if (/^(注意|警告|warning|caution)/i.test(block.text)) {
    return 'warning';
  }
  return 'main';
}

function resolveSourceBlockIds(block: StructuredBlock): string[] {
  const canonicalIds = block.metadata?.canonicalBlockIds?.filter((id) => id.trim());
  if (canonicalIds?.length) {
    return canonicalIds;
  }
  return [block.canonicalBlockId || block.sourceElementId];
}

export function buildSpokenSegments(blocks: StructuredBlock[], options: SegmentBuildOptions): SmartScriptSegment[] {
  const maxLength = options.maxSegmentChars ?? 220;
  const segments: SmartScriptSegment[] = [];
  let currentSectionTitle = '开始';

  for (const block of blocks) {
    if (block.type === 'heading') {
      currentSectionTitle = block.text;
    }

    if (block.type === 'code' && options.codeStrategy === 'skip') {
      continue;
    }

    const spokenText =
      block.type === 'code'
        ? options.codeStrategy === 'summary'
          ? summarizeCodeBlock(block)
          : `下面是一段代码原文：${block.text}`
        : block.type === 'table'
          ? summarizeTableBlock(block)
          : block.text;

    const kind =
      block.type === 'code' || block.type === 'table'
        ? options.codeStrategy === 'summary'
          ? 'code-summary'
          : 'main'
        : inferSegmentKind(block);

    const pieces = block.type === 'code' || block.type === 'table' ? [spokenText] : splitText(spokenText, maxLength);
    pieces.forEach((piece, index) => {
      segments.push({
        id: `${block.id}-segment-${index + 1}`,
        sectionTitle: block.headingPath?.at(-1) || currentSectionTitle,
        spokenText: piece,
        sourceBlockIds: resolveSourceBlockIds(block),
        kind
      });
    });
  }

  return segments;
}
