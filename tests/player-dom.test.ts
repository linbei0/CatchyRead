import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

import { renderPreviewButton } from '@/content/playerMarkup';
import type { PreviewItemViewState } from '@/content/playerViewState';
import { buildPlayerViewCss } from '@/ui/content/player-view';

describe('renderPreviewButton', () => {
  test('为当前段落渲染可扫描的队列按钮', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const item: PreviewItemViewState = {
      id: 'seg-2',
      title: '风险提醒',
      summary: '这一段会提醒你不要把密钥提交到仓库。',
      tone: 'warning',
      active: true
    };

    const button = renderPreviewButton(dom.window.document, item, 1, 1);

    expect(button.classList.contains('active')).toBe(true);
    expect(button.dataset.tone).toBe('warning');
    expect(button.querySelector('small')?.textContent).toBe('提醒');
    expect(button.querySelector('strong')?.textContent).toBe('风险提醒');
    expect(button.querySelector('span')?.textContent).toContain('不要把密钥提交到仓库');
  });
});

describe('buildPlayerViewCss', () => {
  test('为原生下拉选项提供可读的前景色和背景色', () => {
    const css = buildPlayerViewCss();

    expect(css).toContain('option {');
    expect(css).toContain('color: #111827');
    expect(css).toContain('background: #f8fafc');
  });
});
