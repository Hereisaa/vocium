// Render docs/assets/showcase.svg (an animated SVG — the README embeds it
// directly, GitHub plays CSS animations inside <img>) into a GIF fallback for
// places that do not animate SVG (npm, some chat clients):
//   docs/assets/showcase.gif
//
// How: inline the SVG into a tiny HTML page, use the Web Animations API to
// pause every animation at time T, screenshot with headless Edge, repeat for
// each frame, then assemble the frames with sharp (animated GIF, 100 ms/frame).
//
// Run: npm run showcase   (Microsoft Edge must be installed)
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'docs', 'assets');
const svgPath = path.join(assets, 'showcase.svg');
const gifPath = path.join(assets, 'showcase.gif');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const W = 940, H = 380;
const LOOP_MS = 9000;      // must match --t in showcase.svg
const STEP_MS = 100;       // 10 fps keeps the GIF small; the SVG itself is smooth
const SCALE = 1;           // 1x: GIF palette + size budget

const svg = await readFile(svgPath, 'utf8');
const work = await mkdtemp(path.join(tmpdir(), 'vocium-showcase-'));

const frameHtml = (t) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#0e1117;width:${W}px;height:${H}px;overflow:hidden}</style>
${svg}
<script>
  // Freeze every CSS animation at the same instant so the screenshot is a
  // deterministic frame of the loop.
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${t}; }
</script>`;

const frames = [];
for (let t = 0; t < LOOP_MS; t += STEP_MS) {
  const html = path.join(work, `f${t}.html`);
  const png = path.join(work, `f${t}.png`);
  await writeFile(html, frameHtml(t));
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`,
    '--virtual-time-budget=300',
    `--window-size=${W},${H}`,
    `--screenshot=${png}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  frames.push(await readFile(png));
  process.stdout.write(`\rframe ${t / STEP_MS + 1}/${LOOP_MS / STEP_MS}`);
}
process.stdout.write('\n');

const gif = await sharp(frames, { join: { animated: true } })
  .gif({ delay: STEP_MS, loop: 0, effort: 10, colours: 128, dither: 0.4 })
  .toBuffer();
await writeFile(gifPath, gif);
await rm(work, { recursive: true, force: true });
const { size } = await import('node:fs').then((fs) => fs.statSync(gifPath));
console.log(`showcase.gif written: ${frames.length} frames, ${(size / 1024).toFixed(0)} KB`);
