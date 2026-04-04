export function shouldHandlePageSelection(input: {
  isOpen: boolean;
  selectionMode: boolean;
  clickedInsidePlayer: boolean;
  hasBlockTarget: boolean;
}): boolean {
  return input.isOpen && input.selectionMode && !input.clickedInsidePlayer && input.hasBlockTarget;
}
