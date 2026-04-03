import { Readability } from '@mozilla/readability';

import type { PageSnapshot, StructuredBlock, StructuredBlockType } from '@/lib/shared/types';

const BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, pre, blockquote, li, .note, .tip, .warning, .callout';
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
  '.newsletter',
  '.copyright'
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

function getReadabilityReference(document: Document): { title: string; excerpt: string } {
  try {
    const clonedDocument = document.cloneNode(true) as Document;
    const article = new Readability(clonedDocument).parse();
    return {
      title: article?.title?.trim() || document.title.trim() || '未命名网页',
      excerpt: normalizeText(article?.textContent || '')
    };
  } catch {
    return {
      title: document.title.trim() || '未命名网页',
      excerpt: ''
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
  if (element.matches('.note, .tip, .warning, .callout')) {
    return 'note';
  }
  return 'paragraph';
}

function shouldSkip(element: Element): boolean {
  if (element.closest(NOISE_SELECTOR)) {
    return true;
  }

  if (element.tagName.toLowerCase() === 'p' && element.closest('.note, .tip, .warning, .callout') && !element.parentElement?.matches('.note, .tip, .warning, .callout')) {
    return true;
  }

  const text = element.tagName.toLowerCase() === 'pre' ? normalizeCode(element.textContent || '') : normalizeText(element.textContent || '');
  return text.length < 8;
}

function extractLanguage(element: Element): string | undefined {
  const className = String(element.className || '');
  const langMatch = className.match(/language-([a-z0-9-]+)/i);
  return langMatch?.[1];
}

function buildBlock(element: Element, index: number): StructuredBlock | null {
  const type = inferType(element);
  const text = type === 'code' ? normalizeCode(element.textContent || '') : normalizeText(element.textContent || '');
  if (!text) {
    return null;
  }

  const sourceElementId = element.getAttribute('data-catchyread-block-id') || `catchyread-block-${index + 1}`;
  element.setAttribute('data-catchyread-block-id', sourceElementId);

  return {
    id: `${type}-${index + 1}`,
    type,
    text,
    sourceElementId,
    level: type === 'heading' ? Number(element.tagName[1]) : undefined,
    metadata: type === 'code' ? { language: extractLanguage(element) } : undefined
  };
}

function extractBlocks(root: Element): StructuredBlock[] {
  return Array.from(root.querySelectorAll(BLOCK_SELECTOR))
    .filter((element) => !shouldSkip(element))
    .map((element, index) => buildBlock(element, index))
    .filter((item): item is StructuredBlock => Boolean(item));
}

export function extractPageSnapshot(document: Document): PageSnapshot {
  const { title, excerpt } = getReadabilityReference(document);
  const root = findContentRoot(document, excerpt);
  const structuredBlocks = extractBlocks(root);

  return {
    url: document.location?.href || '',
    title,
    language: document.documentElement.lang || 'zh-CN',
    capturedAt: new Date().toISOString(),
    excerpt,
    structuredBlocks
  };
}
