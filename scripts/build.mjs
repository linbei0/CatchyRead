import { build, context } from 'esbuild';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createManifest } from './manifest-config.mjs';

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
  { entryPoints: ['src/app/background/index.ts'], outfile: 'dist/background.js' },
  { entryPoints: ['src/app/content/index.ts'], outfile: 'dist/content.js' },
  { entryPoints: ['src/app/options/index.ts'], outfile: 'dist/options.js' }
];

const manifest = createManifest();

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
