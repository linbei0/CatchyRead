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

function inferSegmentKind(block: StructuredBlock): SmartScriptSegment['kind'] {
  if (/^(注意|警告|warning|caution)/i.test(block.text)) {
    return 'warning';
  }
  return 'main';
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
        : block.type === 'list'
          ? `列表项：${block.text}`
          : block.text;

    const kind =
      block.type === 'code'
        ? options.codeStrategy === 'summary'
          ? 'code-summary'
          : 'main'
        : inferSegmentKind(block);

    const pieces = block.type === 'code' ? [spokenText] : splitText(spokenText, maxLength);
    pieces.forEach((piece, index) => {
      segments.push({
        id: `${block.id}-segment-${index + 1}`,
        sectionTitle: currentSectionTitle,
        spokenText: piece,
        sourceBlockIds: [block.sourceElementId],
        kind
      });
    });
  }

  return segments;
}
