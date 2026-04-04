import type { SmartScriptSegment, StructuredBlock } from '@/shared/types';

const SENTENCE_DELIMITER = /(?<=[。！？!?\.])\s+|\n{2,}/;
const CODE_NOISE_PATTERN = /体验AI代码助手|代码解读|复制代码/g;

export interface RewriteChunk {
  id: string;
  blocks: StructuredBlock[];
  charCount: number;
}

export interface RewriteChunkOptions {
  softCharLimit: number;
  hardCharLimit: number;
}

export interface RewriteValidationOptions {
  allowedSourceBlockIds: string[];
  maxSegmentChars: number;
  sourceOrder: string[];
  blockIdAliasMap?: Record<string, string>;
}

export function getRewriteBlockSourceIds(block: StructuredBlock): string[] {
  const metadataIds = block.metadata?.canonicalBlockIds?.filter((id) => id.trim()) || [];
  if (metadataIds.length) {
    return Array.from(new Set(metadataIds));
  }
  return [block.canonicalBlockId || block.sourceElementId].filter((id): id is string => Boolean(id?.trim()));
}

function sameHeadingPath(left: StructuredBlock, right: StructuredBlock): boolean {
  return (left.headingPath || []).join('\u0000') === (right.headingPath || []).join('\u0000');
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function withRewriteBlockSourceIds(block: StructuredBlock, sourceIds: string[]): StructuredBlock {
  return {
    ...block,
    metadata: {
      ...block.metadata,
      canonicalBlockIds: Array.from(new Set(sourceIds))
    }
  };
}

function cleanRewriteBlockText(block: StructuredBlock): string {
  const trimmed = block.text.trim();
  if (block.type !== 'code') {
    return trimmed;
  }

  const cleaned = trimmed
    .replace(/^\s*[\w#+.-]+\s+(?=(?:体验AI代码助手|代码解读|复制代码))/u, '')
    .replace(CODE_NOISE_PATTERN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || trimmed;
}

export function prepareStructuredBlocksForRewrite(blocks: StructuredBlock[]): StructuredBlock[] {
  const prepared: StructuredBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      continue;
    }

    const text = cleanRewriteBlockText(block);
    if (!text) {
      continue;
    }

    const nextBlock = withRewriteBlockSourceIds(
      {
        ...block,
        text
      },
      getRewriteBlockSourceIds(block)
    );
    const previousBlock = prepared[prepared.length - 1];

    if (
      previousBlock &&
      sameHeadingPath(previousBlock, nextBlock) &&
      Boolean(previousBlock.isWarningLike) === Boolean(nextBlock.isWarningLike)
    ) {
      if (normalizeComparableText(previousBlock.text) === normalizeComparableText(nextBlock.text)) {
        prepared[prepared.length - 1] = withRewriteBlockSourceIds(previousBlock, [
          ...getRewriteBlockSourceIds(previousBlock),
          ...getRewriteBlockSourceIds(nextBlock)
        ]);
        continue;
      }

      if (previousBlock.type === 'list' && nextBlock.type === 'list') {
        prepared[prepared.length - 1] = withRewriteBlockSourceIds(
          {
            ...previousBlock,
            text: `${previousBlock.text}\n${nextBlock.text}`.trim()
          },
          [...getRewriteBlockSourceIds(previousBlock), ...getRewriteBlockSourceIds(nextBlock)]
        );
        continue;
      }
    }

    prepared.push(nextBlock);
  }

  return prepared;
}

function splitBlockText(text: string, hardCharLimit: number): string[] {
  if (text.length <= hardCharLimit) {
    return [text];
  }

  const parts: string[] = [];
  let current = '';
  for (const piece of text.split(SENTENCE_DELIMITER)) {
    const normalizedPiece = piece.trim();
    if (!normalizedPiece) {
      continue;
    }
    if (normalizedPiece.length > hardCharLimit) {
      for (let index = 0; index < normalizedPiece.length; index += hardCharLimit) {
        if (current) {
          parts.push(current.trim());
          current = '';
        }
        parts.push(normalizedPiece.slice(index, index + hardCharLimit).trim());
      }
      continue;
    }
    const candidate = current ? `${current} ${normalizedPiece}` : normalizedPiece;
    if (candidate.length > hardCharLimit && current) {
      parts.push(current.trim());
      current = normalizedPiece;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.length ? parts : [text.slice(0, hardCharLimit)];
}

function splitSpokenText(text: string, maxSegmentChars: number): string[] {
  return splitBlockText(text, maxSegmentChars);
}

export function normalizeStructuredBlocksForRewrite(blocks: StructuredBlock[], hardCharLimit = 2400): StructuredBlock[] {
  return blocks.flatMap((block) => {
    const pieces = splitBlockText(block.text, hardCharLimit);
    if (pieces.length === 1) {
      return [block];
    }

    return pieces.map((piece, index) => ({
      ...block,
      id: `${block.id}::part-${index + 1}`,
      text: piece
    }));
  });
}

export function shouldUseMultiChunkRewrite(blocks: StructuredBlock[]): boolean {
  return blocks.length > 12 || blocks.reduce((sum, block) => sum + block.text.length, 0) > 3200;
}

export function buildRewriteChunks(blocks: StructuredBlock[], options: RewriteChunkOptions): RewriteChunk[] {
  const normalizedBlocks = normalizeStructuredBlocksForRewrite(blocks, options.hardCharLimit);
  const chunks: RewriteChunk[] = [];
  let currentBlocks: StructuredBlock[] = [];
  let currentChars = 0;

  const pushChunk = () => {
    if (!currentBlocks.length) {
      return;
    }
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      blocks: currentBlocks,
      charCount: currentChars
    });
    currentBlocks = [];
    currentChars = 0;
  };

  for (const block of normalizedBlocks) {
    const nextChars = currentChars + block.text.length;
    if (currentBlocks.length && nextChars > options.softCharLimit) {
      pushChunk();
    }
    currentBlocks.push(block);
    currentChars += block.text.length;

    if (currentChars >= options.hardCharLimit) {
      pushChunk();
    }
  }

  pushChunk();
  return chunks;
}

export function validateRewriteSegments(
  segments: SmartScriptSegment[],
  options: RewriteValidationOptions
): SmartScriptSegment[] {
  const allowedIds = new Set(options.allowedSourceBlockIds);
  const sourceOrder = new Map(options.sourceOrder.map((id, index) => [id, index]));
  const blockIdAliasMap = options.blockIdAliasMap || {};
  let lastOrder = -1;
  const normalizedSegments = segments.flatMap((segment) => {
    const normalizedSourceBlockIds = segment.sourceBlockIds.map((id) => blockIdAliasMap[id] || id);
    const pieces = splitSpokenText(segment.spokenText, options.maxSegmentChars);
    if (pieces.length === 1) {
      return [
        {
          ...segment,
          sourceBlockIds: normalizedSourceBlockIds
        }
      ];
    }

    return pieces.map((piece, pieceIndex) => ({
      ...segment,
      id: `${segment.id}::part-${pieceIndex + 1}`,
      spokenText: piece,
      sourceBlockIds: normalizedSourceBlockIds
    }));
  });

  return normalizedSegments.map((segment, index) => {
    if (!segment.id.trim() || !segment.sectionTitle.trim() || !segment.spokenText.trim()) {
      throw new Error(`smart segment ${index + 1} 缺少必要字段。`);
    }
    if (!['main', 'code-summary', 'warning'].includes(segment.kind)) {
      throw new Error(`smart segment ${index + 1} kind 非法。`);
    }
    if (!segment.sourceBlockIds.length) {
      throw new Error(`smart segment ${index + 1} 缺少 sourceBlockIds。`);
    }
    if (segment.spokenText.length > options.maxSegmentChars) {
      throw new Error(`smart segment ${index + 1} 超出长度限制。`);
    }

    const orders = segment.sourceBlockIds.map((id) => {
      if (!allowedIds.has(id)) {
        throw new Error(`smart segment ${index + 1} 的 sourceBlockIds 非法。`);
      }
      return sourceOrder.get(id) ?? -1;
    });
    const currentOrder = Math.min(...orders);
    if (currentOrder < lastOrder) {
      throw new Error(`smart segment ${index + 1} 的 sourceBlockIds 顺序逆序。`);
    }
    lastOrder = currentOrder;
    return segment;
  });
}
