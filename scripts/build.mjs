import { build, context } from 'esbuild';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  platform: 'browser',
  logLevel: 'info',
  alias: {
    '@': path.join(root, 'src')
  }
};

const entryPoints = [
  { entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js' },
  { entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js' },
  { entryPoints: ['src/options/index.ts'], outfile: 'dist/options.js' }
];

const manifest = {
  manifest_version: 3,
  name: 'CatchyRead',
  version: '0.1.0',
  description: '智能提取网页正文，整理后自然朗读的浏览器插件。',
  permissions: ['storage', 'tabs'],
  host_permissions: ['<all_urls>'],
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
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle'
    }
  ],
  browser_specific_settings: {
    gecko: {
      id: 'catchyread@example.com'
    }
  }
};

async function buildAll() {
  await mkdir(dist, { recursive: true });
  await Promise.all(
    entryPoints.map((item) =>
      build({
        ...common,
        ...item
      })
    )
  );
  await cp(path.join(root, 'src/options/options.html'), path.join(dist, 'options.html'));
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

if (watch) {
  await mkdir(dist, { recursive: true });
  const contexts = await Promise.all(
    entryPoints.map((item) =>
      context({
        ...common,
        ...item
      })
    )
  );
  await Promise.all(contexts.map((item) => item.watch()));
  await cp(path.join(root, 'src/options/options.html'), path.join(dist, 'options.html'));
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('CatchyRead watch build started.');
} else {
  await buildAll();
}
