export type BrowserSpeechAction = 'resume' | 'pause' | 'restart';

export function resolveBrowserSpeechAction(args: { hasActiveUtterance: boolean; isPaused: boolean }): BrowserSpeechAction {
  if (args.hasActiveUtterance && args.isPaused) {
    return 'resume';
  }
  if (args.hasActiveUtterance) {
    return 'pause';
  }
  return 'restart';
}
