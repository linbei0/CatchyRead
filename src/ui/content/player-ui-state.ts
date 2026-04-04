export interface CollapsedVisibilityModel {
  showToolbar: boolean;
  showTransport: boolean;
  showQueue: boolean;
  showSecondaryControls: boolean;
  collapseButtonLabel: string;
}

export function getCollapsedVisibilityModel(collapsed: boolean): CollapsedVisibilityModel {
  return {
    showToolbar: true,
    showTransport: true,
    showQueue: !collapsed,
    showSecondaryControls: !collapsed,
    collapseButtonLabel: collapsed ? '展开' : '折叠'
  };
}
