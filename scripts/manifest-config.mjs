export function createManifest() {
  return {
    manifest_version: 3,
    name: 'CatchyRead',
    version: '0.1.0',
    description: '智能提取网页正文，整理后自然朗读的浏览器插件。',
    permissions: ['storage', 'tabs', 'activeTab', 'scripting'],
    background: {
      service_worker: 'background.js',
      type: 'module'
    },
    action: {
      default_title: 'CatchyRead'
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    commands: {
      toggle_player: {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
          mac: 'Command+Shift+Y'
        },
        description: '打开或关闭 CatchyRead 悬浮播放器'
      }
    },
    browser_specific_settings: {
      gecko: {
        id: 'catchyread@example.com'
      }
    }
  };
}
