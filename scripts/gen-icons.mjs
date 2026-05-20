// Rasterize the vector master (app-tauri/src-tauri/icons/icon.svg) into every
// size Vocium needs. The SVG is the source of truth — PNGs/ICO are derived and
// regenerable, so they never "drift" or distort (square→square, fit:fill, the
// SVG is re-rasterized at each target density rather than upscaled).
//
// Run: npm run icons   (deps: sharp, png-to-ico — devDependencies)
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'app-tauri', 'src-tauri', 'icons');
const masterPath = path.join(iconsDir, 'icon.svg');

const svg = await readFile(masterPath);

// Re-rasterize the SVG at each size with a density scaled to that size so even
// 16px stays crisp (no blurry downscale from one big bitmap).
const renderPng = (size) =>
  sharp(svg, { density: Math.max(96, size * 4) })
    .resize(size, size, { fit: 'fill' }) // source is square 256 → no distortion
    .png({ compressionLevel: 9 })
    .toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const buf = {};
for (const s of sizes) buf[s] = await renderPng(s);

// Tauri-referenced filenames (see tauri.conf.json bundle.icon).
await writeFile(path.join(iconsDir, '32x32.png'), buf[32]);
await writeFile(path.join(iconsDir, '128x128.png'), buf[128]);
await writeFile(path.join(iconsDir, '128x128@2x.png'), buf[256]);

// Extra stored sizes (lossless PNG — the non-distorting raster format).
for (const s of [16, 24, 48, 64, 512, 1024]) {
  await writeFile(path.join(iconsDir, `${s}x${s}.png`), buf[s]);
}

// Multi-resolution Windows .ico (Explorer/taskbar/exe pick the best size).
const ico = await pngToIco([buf[16], buf[24], buf[32], buf[48], buf[64], buf[128], buf[256]]);
await writeFile(path.join(iconsDir, 'icon.ico'), ico);

console.log(
  `icons generated from icon.svg → ${sizes.map((s) => `${s}px`).join(', ')} + icon.ico`,
);
