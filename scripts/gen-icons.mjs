// Rasterize the vector masters into every size Vocium needs:
//   - app-tauri/src-tauri/icons/icon.svg → app icon set (PNG sizes + icon.ico)
//   - app-tauri/src-tauri/icons/tray.svg → tray / menu-bar glyph in two colours:
//       tray-dark-{16,22,32,44}.png   black mark, for light taskbars / menu bars
//       tray-light-{16,22,32,44}.png  white mark, for dark taskbars (the SVG with its one fill swapped)
// The SVGs are the source of truth — PNGs/ICO are derived and regenerable, so
// they never "drift" or distort (square→square, fit:fill, the SVG is
// re-rasterized at each target density rather than upscaled).
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
const trayPath = path.join(iconsDir, 'tray.svg');

const svg = await readFile(masterPath);

// tray.svg is the black variant and its fill is the only colour in it, so the white variant is
// the same file with that one colour swapped. Fail loudly if the token ever disappears.
const TRAY_INK = '#000000';
const TRAY_PAPER = '#ffffff';
const trayDarkSvg = await readFile(trayPath, 'utf8');
if (!trayDarkSvg.includes(TRAY_INK)) throw new Error(`tray.svg no longer contains ${TRAY_INK}`);
const trayLightSvg = trayDarkSvg.replaceAll(TRAY_INK, TRAY_PAPER);

// Re-rasterize an SVG at each size with a density scaled to that size so even
// 16px stays crisp (no blurry downscale from one big bitmap).
const renderPng = (source, size) =>
  sharp(source, { density: Math.max(96, size * 4) })
    .resize(size, size, { fit: 'fill' }) // sources are square → no distortion
    .png({ compressionLevel: 9 })
    .toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const buf = {};
for (const s of sizes) buf[s] = await renderPng(svg, s);

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

// Tray / menu-bar glyph (single colour, transparent background). build_tray in lib.rs embeds
// tray-dark-32.png (black mark) on light Windows taskbars and macOS (as a template image: alpha
// only) and tray-light-32.png (white mark) on dark Windows taskbars and elsewhere. 22/44 cover
// Linux and Retina menu bars.
const traySizes = [16, 22, 32, 44];
for (const s of traySizes) {
  await writeFile(path.join(iconsDir, `tray-dark-${s}.png`), await renderPng(Buffer.from(trayDarkSvg), s));
  await writeFile(path.join(iconsDir, `tray-light-${s}.png`), await renderPng(Buffer.from(trayLightSvg), s));
}

console.log(
  `icons generated from icon.svg → ${sizes.map((s) => `${s}px`).join(', ')} + icon.ico; ` +
    `tray.svg → ${['dark', 'light'].flatMap((v) => traySizes.map((s) => `tray-${v}-${s}.png`)).join(', ')}`,
);
