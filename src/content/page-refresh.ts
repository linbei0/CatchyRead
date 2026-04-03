export function shouldMarkSnapshotStale(input: {
  previousUrl: string;
  nextUrl: string;
  addedNodes: number;
  removedNodes: number;
}): boolean {
  if (input.previousUrl !== input.nextUrl) {
    return true;
  }

  return input.addedNodes + input.removedNodes >= 10;
}

export class PageRefreshWatcher {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentUrl = window.location.href;
  private addedNodes = 0;
  private removedNodes = 0;

  constructor(private onStale: () => void) {}

  start(): void {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        this.addedNodes += record.addedNodes.length;
        this.removedNodes += record.removedNodes.length;
      }
      this.scheduleCheck();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.addedNodes = 0;
    this.removedNodes = 0;
    this.currentUrl = window.location.href;
  }

  private scheduleCheck(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const nextUrl = window.location.href;
      if (
        shouldMarkSnapshotStale({
          previousUrl: this.currentUrl,
          nextUrl,
          addedNodes: this.addedNodes,
          removedNodes: this.removedNodes
        })
      ) {
        this.currentUrl = nextUrl;
        this.addedNodes = 0;
        this.removedNodes = 0;
        this.onStale();
      }
    }, 300);
  }
}
