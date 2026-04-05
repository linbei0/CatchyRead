import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

import { renderPreviewButton } from '@/content/playerMarkup';
import type { PreviewItemViewState } from '@/content/playerViewState';
import { buildPlayerViewCss, PlayerView } from '@/ui/content/player-view';

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

    const button = renderPreviewButton(dom.window.document, item, 1);

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

  test('采用固定高度 popup 感面板，并通过悬浮更多面板避免内部滚动条', () => {
    const css = buildPlayerViewCss();

    expect(css).toContain('height: min(680px, calc(100vh - 16px))');
    expect(css).toContain('overflow: clip');
    expect(css).toContain('.more-panel {');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('.collapsed .hero, .collapsed .preview-shell, .collapsed .secondary-controls { display: none; }');
    expect(css).toContain('.collapsed .collapsed-strip { display: grid; }');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  });
});

describe('PlayerView', () => {
  test('只渲染单条队列预告，并提供图标按钮的可访问标签', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const view = new PlayerView(dom.window.document);

    view.show();
    view.renderPreview(
      [
        {
          id: 'seg-1',
          title: '环境准备',
          summary: '先确认 Node 版本。',
          tone: 'main',
          active: false
        },
        {
          id: 'seg-2',
          title: '风险提醒',
          summary: '不要把密钥提交到仓库。',
          tone: 'warning',
          active: true
        }
      ],
      1,
      2,
      false,
      '内容已变更'
    );

    const root = view.getRoot();
    expect(root?.querySelectorAll('#preview button').length).toBe(1);
    expect(root?.querySelector('#preview button strong')?.textContent).toBe('风险提醒');
    expect(root?.querySelector('#preview-meta')?.textContent).toBe('02 / 02');
    expect(root?.querySelector<HTMLButtonElement>('#prev')?.getAttribute('aria-label')).toBe('上一段');
    expect(root?.querySelector<HTMLButtonElement>('#play-pause')?.getAttribute('aria-label')).toBe('开始收听');
    expect(root?.querySelector<HTMLButtonElement>('#next')?.getAttribute('aria-label')).toBe('下一段');
  });

  test('折叠后进入迷你播放器态而不是仅隐藏少量区块', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const view = new PlayerView(dom.window.document);

    view.show();
    view.setHeadline('九、学习路线建议', '46 / 82', '已暂停', 'warning');
    view.setCollapsed(true);

    const root = view.getRoot();
    expect(root?.classList.contains('collapsed')).toBe(true);
    expect(root?.querySelector('#collapsed-title')?.textContent).toBe('九、学习路线建议');
    expect(root?.querySelector('#collapsed-position')?.textContent).toBe('46 / 82');
    expect(root?.querySelector<HTMLButtonElement>('#collapse')?.getAttribute('aria-label')).toBe('展开');
  });
});
