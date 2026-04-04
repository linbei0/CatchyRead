import type { SmartScriptSegment } from '@/shared/types';
import { shouldHandlePageSelection } from '@/domain/content/page-selection';
import { PLAYER_HOST_ID } from '@/ui/content/player-view';

const HIGHLIGHT_STYLE_ID = 'catchyread-highlight-style';

function ensureHighlightStyle(documentRef: Document): void {
  if (documentRef.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = documentRef.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    [data-catchyread-current="true"] {
      outline: 2px solid rgba(129, 140, 248, 0.9);
      outline-offset: 4px;
      background: rgba(129, 140, 248, 0.08);
      border-radius: 10px;
    }
  `;
  documentRef.documentElement.append(style);
}

export class SelectionController {
  private highlightedIds: string[] = [];

  constructor(private readonly documentRef: Document) {
    ensureHighlightStyle(documentRef);
  }

  highlight(segment: SmartScriptSegment): void {
    this.clearHighlight();
    this.highlightedIds = [...segment.sourceBlockIds];
    segment.sourceBlockIds.forEach((id) => {
      this.documentRef.querySelector(`[data-catchyread-block-id="${id}"]`)?.setAttribute('data-catchyread-current', 'true');
    });
  }

  clearHighlight(): void {
    this.highlightedIds.forEach((id) => {
      this.documentRef.querySelector(`[data-catchyread-block-id="${id}"]`)?.removeAttribute('data-catchyread-current');
    });
    this.highlightedIds = [];
  }

  bindDocumentSelection(args: {
    isOpen: () => boolean;
    isSelectionMode: () => boolean;
    getSegments: () => SmartScriptSegment[];
    onPick: (index: number, event: MouseEvent) => void;
  }): void {
    this.documentRef.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const clickedInsidePlayer = Boolean(target.closest(`#${PLAYER_HOST_ID}`));
        const source = target.closest<HTMLElement>('[data-catchyread-block-id]');
        if (
          !shouldHandlePageSelection({
            isOpen: args.isOpen(),
            selectionMode: args.isSelectionMode(),
            clickedInsidePlayer,
            hasBlockTarget: Boolean(source)
          })
        ) {
          return;
        }
        if (!source) {
          return;
        }
        const sourceId = source.getAttribute('data-catchyread-block-id') || '';
        const index = args.getSegments().findIndex((item) => item.sourceBlockIds.includes(sourceId));
        if (index >= 0) {
          event.preventDefault();
          event.stopPropagation();
          args.onPick(index, event);
        }
      },
      true
    );
  }
}
