// Render the README banner from docs/assets/showcase.html (which uses the
// app's real design tokens / state CSS) to a crisp 2x still:
//   docs/assets/showcase.png
//
// No extra deps: one headless Edge screenshot at a virtual-time where the
// one-shot animations (inject check, error) have settled.
//
// Run: npm run banner   (Microsoft Edge must be installed)
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'docs', 'assets');
const htmlUrl = 'file:///' + path.join(assets, 'showcase.html').replace(/\\/g, '/');
const out = path.join(assets, 'showcase.png');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const W = 1280, H = 316;

execFileSync(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--virtual-time-budget=900',           // pop/shake done; eq/spin mid-motion
  `--window-size=${W},${H}`,
  `--screenshot=${out}`,
  htmlUrl,
], { stdio: 'ignore' });

// Re-encode for smaller size (read fully into a buffer before writing back).
const buf = await sharp(out).png({ compressionLevel: 9 }).toBuffer();
await writeFile(out, buf);
const { width, height } = await sharp(out).metadata();
console.log(`showcase.png written (${width}x${height}) from showcase.html`);
