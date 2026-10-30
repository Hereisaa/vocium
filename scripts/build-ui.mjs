/**
 * build-ui.mjs — bundle the webview entry points with esbuild.
 *
 *   app-tauri/ui/src/app.js      -> app-tauri/ui/build/app.js
 *   app-tauri/ui/src/settings.js -> app-tauri/ui/build/settings.js
 *
 * Both import @vocium/voice-core (workspace package) and @tauri-apps/*; esbuild
 * resolves them from node_modules so the webview only ever loads one file per
 * window. `--watch` rebuilds on change (used alongside `tauri dev`).
 *
 * app-tauri/ui/build/ is gitignored — run `npm run build:ui` (or `npm run dev`).
 */
import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = path.join(root, 'app-tauri', 'ui');

const options = {
  entryPoints: [
    path.join(ui, 'src', 'app.js'),
    path.join(ui, 'src', 'settings.js'),
  ],
  outdir: path.join(ui, 'build'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build-ui] watching…');
} else {
  await build(options);
}
