/**
 * copy-vad-assets.mjs
 *
 * Copies vad-web + onnxruntime-web browser assets from node_modules into
 * app-tauri/ui/vad/ so the Tauri webview can load them as static files.
 *
 * Run via: npm run vad:assets
 *
 * These are large/binary reproducible files — app-tauri/ui/vad/ is gitignored.
 * Add this script to git instead of the copied binaries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'app-tauri', 'ui', 'vad');

fs.mkdirSync(dest, { recursive: true });

// Files to copy: [source relative to root, dest filename]
const assets = [
  // onnxruntime-web: WASM backend JS (sets global `var ort` when loaded as <script>)
  ['node_modules/onnxruntime-web/dist/ort.wasm.min.js', 'ort.wasm.min.js'],
  // onnxruntime-web: WASM binary (loaded by ort.wasm.min.js at runtime)
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  // onnxruntime-web: threaded WASM worker script
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  // vad-web: UMD browser bundle (uses self.ort from ort.wasm.min.js; exports self.vad)
  ['node_modules/@ricky0123/vad-web/dist/bundle.min.js', 'vad.bundle.min.js'],
  // vad-web: Silero VAD legacy ONNX model (loaded via fetch by NonRealTimeVAD)
  ['node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', 'silero_vad_legacy.onnx'],
];

let ok = 0;
for (const [src, name] of assets) {
  const srcPath = path.join(root, src);
  const dstPath = path.join(dest, name);
  try {
    fs.copyFileSync(srcPath, dstPath);
    const size = fs.statSync(dstPath).size;
    console.log(`  copied  ${name}  (${(size / 1024).toFixed(1)} KB)`);
    ok++;
  } catch (err) {
    console.error(`  ERROR copying ${src}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`vad:assets done — ${ok} files → ${dest}`);
