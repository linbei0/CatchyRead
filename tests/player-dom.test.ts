import { describe, expect, test, vi } from 'vitest';
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

    expect(css).toContain('height: min(612px, calc(100vh - 16px))');
    expect(css).toContain('overflow: clip');
    expect(css).toContain('.more-panel {');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('.queue-panel {');
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('.collapsed .hero, .collapsed .secondary-controls { display: none; }');
    expect(css).toContain('.collapsed .collapsed-strip { display: grid; }');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  });
});

describe('PlayerView', () => {
  test('状态卡作为段落面板入口，并提供主控按钮的可访问标签', () => {
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
    expect(root?.querySelector('#queue-trigger .notice-title')?.textContent).toBe('点击查看全部段落');
    expect(root?.querySelector('#preview-meta')?.textContent).toBe('02 / 02');
    expect(root?.querySelector<HTMLButtonElement>('#prev')?.getAttribute('aria-label')).toBe('上一段');
    expect(root?.querySelector<HTMLButtonElement>('#play-pause')?.getAttribute('aria-label')).toBe('开始收听');
    expect(root?.querySelector<HTMLButtonElement>('#next')?.getAttribute('aria-label')).toBe('下一段');
  });

  test('点击状态卡会打开悬浮段落面板并列出全部段落', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const view = new PlayerView(dom.window.document);

    view.show();
    view.renderPreview(
      [
        { id: 'seg-1', title: '环境准备', summary: '先确认 Node 版本。', tone: 'main', active: false },
        { id: 'seg-2', title: '风险提醒', summary: '不要把密钥提交到仓库。', tone: 'warning', active: true }
      ],
      1,
      2,
      false,
      '内容已变更'
    );

    const root = view.getRoot()!;
    const trigger = root.querySelector<HTMLButtonElement>('#queue-trigger')!;
    trigger.click();

    expect(root.querySelector('.panel')?.classList.contains('queue-open')).toBe(true);
    expect(root.querySelectorAll('#queue-panel button[data-index]').length).toBe(2);
  });

  test('拖动进度条时会把比例回传给视图层处理', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const view = new PlayerView(dom.window.document);
    const onSeek = vi.fn();

    view.on('progressSeek', onSeek as never);
    view.show();

    const root = view.getRoot()!;
    const track = root.querySelector<HTMLElement>('#progress-track')!;
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 10, width: 200 }),
      configurable: true
    });

    track.dispatchEvent(new dom.window.MouseEvent('mousedown', { clientX: 110, bubbles: true }));

    expect(onSeek).toHaveBeenCalledWith(0.5);
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
