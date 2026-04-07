import { Readability } from '@mozilla/readability';

import type { PageSnapshot, StructuredBlock, StructuredBlockType } from '@/lib/shared/types';

const BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, pre, blockquote, li, table, .note, .tip, .warning, .callout';
const NOISE_SELECTOR = [
  'header',
  'footer',
  'nav',
  'aside',
  'form',
  'dialog',
  '[role="navigation"]',
  '[role="complementary"]',
  '.comments',
  '.comment',
  '.related',
  '.recommend',
  '.breadcrumb',
  '.sidebar',
  '.advertisement',
  '.ads',
  '.share',
  '.social',
  '.toc',
  '.table-of-contents',
  '.contents',
  '.pagination',
  '.pager',
  '.recommendations',
  '.recommended',
  '.newsletter',
  '.copyright',
  '[data-testid*="toc"]',
  '[aria-label*="breadcrumb"]'
].join(', ');

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeCode(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function normalizeTable(element: Element): { text: string; rowCount: number; columnCount: number } {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.querySelectorAll('th, td'))
        .map((cell) => normalizeText(cell.textContent || ''))
        .filter(Boolean)
    )
    .filter((cells) => cells.length);

  return {
    text: rows.map((cells) => cells.join(' | ')).join('\n').trim(),
    rowCount: rows.length,
    columnCount: Math.max(0, ...rows.map((cells) => cells.length))
  };
}

function getReadabilityReference(document: Document): {
  title: string;
  excerpt: string;
  siteName?: string;
  byline?: string;
  language?: string;
} {
  try {
    const clonedDocument = document.cloneNode(true) as Document;
    const article = new Readability(clonedDocument).parse();
    return {
      title: article?.title?.trim() || document.title.trim() || '未命名网页',
      excerpt: normalizeText(article?.excerpt || article?.textContent || ''),
      siteName: article?.siteName?.trim() || undefined,
      byline: article?.byline?.trim() || undefined,
      language: article?.lang?.trim() || undefined
    };
  } catch {
    return {
      title: document.title.trim() || '未命名网页',
      excerpt: '',
      siteName: undefined,
      byline: undefined,
      language: undefined
    };
  }
}

function commonPrefixLength(left: string, right: string): number {
  const shorter = Math.min(left.length, right.length, 420);
  let count = 0;
  while (count < shorter && left[count] === right[count]) {
    count += 1;
  }
  return count;
}

function scoreCandidate(element: Element, excerpt: string): number {
  const text = normalizeText(element.textContent || '');
  const paragraphCount = element.querySelectorAll('p').length;
  const headingCount = element.querySelectorAll('h1, h2, h3').length;
  const noisePenalty = element.querySelectorAll(NOISE_SELECTOR).length * 220;
  const overlap = excerpt && text ? commonPrefixLength(text, excerpt) : 0;
  return text.length + paragraphCount * 180 + headingCount * 90 + overlap - noisePenalty;
}

function findContentRoot(document: Document, excerpt: string): Element {
  const candidates = [
    ...Array.from(document.querySelectorAll('article, main, [role="main"], .content, #content, .post, .article, .entry-content')),
    document.body
  ].filter(Boolean) as Element[];

  return candidates.reduce((best, current) => {
    return scoreCandidate(current, excerpt) > scoreCandidate(best, excerpt) ? current : best;
  }, candidates[0] || document.body);
}

function inferType(element: Element): StructuredBlockType {
  const tagName = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tagName)) {
    return 'heading';
  }
  if (tagName === 'pre') {
    return 'code';
  }
  if (tagName === 'blockquote') {
    return 'quote';
  }
  if (tagName === 'li') {
    return 'list';
  }
  if (tagName === 'table') {
    return 'table';
  }
  if (element.matches('.note, .tip, .warning, .callout')) {
    return 'note';
  }
  return 'paragraph';
}

function shouldSkip(element: Element): boolean {
  if (element.closest(NOISE_SELECTOR)) {
    return true;
  }

  if (element.tagName.toLowerCase() === 'p' && element.closest('.note, .tip, .warning, .callout')) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  const text =
    tagName === 'pre'
      ? normalizeCode(element.textContent || '')
      : tagName === 'table'
        ? normalizeTable(element).text
        : normalizeText(element.textContent || '');
  if (/^(目录|相关文章|相关阅读|you may also like|related articles|share this|上一篇|下一篇)$/i.test(text)) {
    return true;
  }
  return text.length < 8;
}

function extractLanguage(element: Element): string | undefined {
  const className = String(element.className || '');
  const langMatch = className.match(/language-([a-z0-9-]+)/i);
  return langMatch?.[1];
}

function inferPriority(text: string, isWarningLike: boolean): StructuredBlock['priority'] {
  if (isWarningLike) {
    return 'critical';
  }
  if (/^(总结|结论|限制|限制条件|注意事项|caveat|limitation|conclusion)/i.test(text)) {
    return 'critical';
  }
  if (text.length < 48) {
    return 'supporting';
  }
  return 'normal';
}

function buildBlock(element: Element, index: number, headingPath: string[]): StructuredBlock | null {
  const type = inferType(element);
  const tableMeta = type === 'table' ? normalizeTable(element) : null;
  const text =
    type === 'code'
      ? normalizeCode(element.textContent || '')
      : type === 'table'
        ? tableMeta?.text || ''
        : normalizeText(element.textContent || '');
  if (!text) {
    return null;
  }

  const sourceElementId = element.getAttribute('data-catchyread-block-id') || `catchyread-block-${index + 1}`;
  element.setAttribute('data-catchyread-block-id', sourceElementId);
  const isWarningLike = type === 'note' || /^(注意|警告|warning|caution|danger|important)/i.test(text);

  return {
    id: `${type}-${index + 1}`,
    canonicalBlockId: sourceElementId,
    type,
    text,
    sourceElementId,
    level: type === 'heading' ? Number(element.tagName[1]) : undefined,
    headingPath,
    priority: inferPriority(text, isWarningLike),
    isWarningLike,
    metadata:
      type === 'code'
        ? { language: extractLanguage(element) }
        : type === 'note'
          ? {
              label: ['warning', 'tip', 'note', 'callout'].find((value) => element.classList.contains(value))
            }
          : type === 'table'
            ? {
                rowCount: tableMeta?.rowCount,
                columnCount: tableMeta?.columnCount
              }
            : undefined
  };
}

function extractBlocks(root: Element): StructuredBlock[] {
  const headingPath: string[] = [];

  return Array.from(root.querySelectorAll(BLOCK_SELECTOR))
    .filter((element) => !shouldSkip(element))
    .map((element, index) => {
      const type = inferType(element);
      if (type === 'heading') {
        const level = Number(element.tagName[1]);
        headingPath.length = Math.max(0, level - 1);
        headingPath[level - 1] = normalizeText(element.textContent || '') || '未命名章节';
      }
      return buildBlock(element, index, [...headingPath.filter(Boolean)]);
    })
    .filter((item): item is StructuredBlock => Boolean(item));
}

export function extractPageSnapshot(document: Document): PageSnapshot {
  const { title, excerpt, siteName, byline, language } = getReadabilityReference(document);
  const root = findContentRoot(document, excerpt);
  const structuredBlocks = extractBlocks(root);

  return {
    url: document.location?.href || '',
    title,
    language: document.documentElement.lang || language || navigator.language || 'zh-CN',
    capturedAt: new Date().toISOString(),
    excerpt,
    siteName,
    byline,
    structuredBlocks
  };
}
