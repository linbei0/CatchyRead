import type { PreviewItemViewState } from '@/domain/playback/player-view-state';

export function renderPreviewButton(
  documentRef: Document,
  item: PreviewItemViewState,
  index: number
): HTMLButtonElement {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = item.active ? 'active' : '';
  button.dataset.tone = item.tone;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(item.active));
  button.tabIndex = item.active ? 0 : -1;
  button.title = item.summary;
  button.setAttribute('aria-label', `${item.title}：${item.summary}`);

  const sectionLabel = documentRef.createElement('small');
  sectionLabel.textContent = item.tone === 'warning' ? '提醒' : item.tone === 'code' ? '代码摘要' : '正文';

  const title = documentRef.createElement('strong');
  title.textContent = item.title;

  const summary = documentRef.createElement('span');
  summary.textContent = item.summary;

  button.dataset.index = String(index);
  button.append(sectionLabel, title, summary);
  return button;
}
