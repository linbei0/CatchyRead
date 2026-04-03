export function resolvePreviewKeyboardAction(
  key: string,
  currentIndex: number,
  total: number
): {
  nextIndex: number;
  handled: boolean;
  activate: boolean;
} {
  if (key === 'ArrowDown') {
    return {
      nextIndex: Math.min(currentIndex + 1, Math.max(total - 1, 0)),
      handled: true,
      activate: false
    };
  }

  if (key === 'ArrowUp') {
    return {
      nextIndex: Math.max(currentIndex - 1, 0),
      handled: true,
      activate: false
    };
  }

  if (key === 'Enter' || key === ' ') {
    return {
      nextIndex: currentIndex,
      handled: true,
      activate: true
    };
  }

  return {
    nextIndex: currentIndex,
    handled: false,
    activate: false
  };
}
