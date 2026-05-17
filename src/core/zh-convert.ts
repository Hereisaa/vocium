// src/core/zh-convert.ts
//
// Local, offline Chinese script conversion via opencc-js (no API/network).
// Total: any string in → string out, never throws. Each direction is a
// lazy singleton; on build/convert failure the original text is returned.
import { Converter } from 'opencc-js';

export type ZhMode = 'twp' | 'cn'; // twp = Traditional(Taiwan), cn = Simplified

type ConvFn = (text: string) => string;

const cache: Record<ZhMode, ConvFn | null | false> = { twp: null, cn: null };
const OPTS: Record<ZhMode, { from: string; to: string }> = {
  twp: { from: 'cn', to: 'twp' },  // Simplified → Traditional(Taiwan, phrases)
  cn: { from: 'twp', to: 'cn' },   // Traditional(Taiwan, phrases) → Simplified
};

function getConverter(mode: ZhMode): ConvFn | null {
  const c = cache[mode];
  if (c !== null) return c || null; // false → null (don't retry a broken build)
  try {
    const fn = Converter(OPTS[mode]);
    cache[mode] = fn;
    return fn;
  } catch (err) {
    console.warn(`[zh-convert] opencc-js Converter(${mode}) failed; passthrough:`, err);
    cache[mode] = false;
    return null;
  }
}

/** Force the chosen Chinese script. mode 'twp' → Traditional(TW),
 *  'cn' → Simplified. Already-target text passes through. Never throws. */
export function convertZh(text: string, mode: ZhMode): string {
  if (!text) return text;
  try {
    const fn = getConverter(mode);
    return fn ? fn(text) : text;
  } catch {
    return text;
  }
}
