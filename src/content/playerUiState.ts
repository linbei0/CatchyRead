export interface CollapsedVisibilityModel {
  showToolbar: boolean;
  showContentControls: boolean;
  collapseButtonLabel: string;
}

export function getCollapsedVisibilityModel(collapsed: boolean): CollapsedVisibilityModel {
  return {
    showToolbar: true,
    showContentControls: !collapsed,
    collapseButtonLabel: collapsed ? '展开' : '折叠'
  };
}
