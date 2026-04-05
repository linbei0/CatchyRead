export type PlayerIconName =
  | 'previous'
  | 'play'
  | 'pause'
  | 'next'
  | 'collapse'
  | 'expand'
  | 'close'
  | 'refresh'
  | 'locate'
  | 'settings'
  | 'more'
  | 'chevron-left'
  | 'chevron-right'
  | 'browser'
  | 'remote'
  | 'speed'
  | 'code';

const ICON_PATHS: Record<PlayerIconName, string> = {
  previous: '<path d="M11 7L6 12L11 17V7Z"/><path d="M18 7L13 12L18 17V7Z"/>',
  play: '<path d="M8 6.5V17.5L18 12L8 6.5Z"/>',
  pause: '<path d="M8 6H11V18H8V6Z"/><path d="M13 6H16V18H13V6Z"/>',
  next: '<path d="M13 7L18 12L13 17V7Z"/><path d="M6 7L11 12L6 17V7Z"/>',
  collapse: '<path d="M7 14L12 9L17 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  expand: '<path d="M7 10L12 15L17 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  close: '<path d="M8 8L16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M16 8L8 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>',
  refresh:
    '<path d="M17 8A6 6 0 1 0 18 12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M15.5 5.5H19V9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  locate:
    '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4V7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M12 17V20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M4 12H7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M17 12H20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>',
  settings:
    '<path d="M12 8.7A3.3 3.3 0 1 0 12 15.3A3.3 3.3 0 1 0 12 8.7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5L20 12L19.4 10.5L17.6 10L16.8 8.3L15 8L13.5 6.6L12 6L10.5 6.6L9 8L7.2 8.3L6.4 10L4.6 10.5L4 12L4.6 13.5L6.4 14L7.2 15.7L9 16L10.5 17.4L12 18L13.5 17.4L15 16L16.8 15.7L17.6 14L19.4 13.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.4"/>',
  more: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>',
  'chevron-left': '<path d="M14.5 7L9.5 12L14.5 17" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  'chevron-right': '<path d="M9.5 7L14.5 12L9.5 17" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  browser:
    '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17.5A2.5 2.5 0 0 1 20 7.5V16.5A2.5 2.5 0 0 1 17.5 19H6.5A2.5 2.5 0 0 1 4 16.5V7.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5H20" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="7.25" r="0.75"/><circle cx="10" cy="7.25" r="0.75"/>',
  remote:
    '<path d="M6 8.5A2.5 2.5 0 0 1 8.5 6H15.5A2.5 2.5 0 0 1 18 8.5V15.5A2.5 2.5 0 0 1 15.5 18H8.5A2.5 2.5 0 0 1 6 15.5V8.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10H14V14H10V10Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10.5V13.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M20.5 10.5V13.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>',
  speed:
    '<path d="M6 16A6.5 6.5 0 1 1 18 12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M12 12L16.5 9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="M6.5 18H17.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>',
  code:
    '<path d="M9 8L5 12L9 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="M15 8L19 12L15 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="M13 6L11 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>'
};

export function renderPlayerIcon(name: PlayerIconName, className = 'icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICON_PATHS[name]}</svg>`;
}
