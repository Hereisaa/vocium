// scripts/probe-groq.mjs
//
// Non-mic Groq STT integration probe. Exercises the REAL compiled
// GroqSttAdapter against the live Groq endpoint using an audio file on
// disk, so "is the API call wired correctly" is verified independently of
// microphone capture and the Tauri GUI.
//
// Usage (PowerShell):
//   npm run build                       # ensure dist/ is current
//   $env:GROQ_API_KEY = "gsk_..."       # never hardcode / never commit
//   node scripts/probe-groq.mjs path\to\sample.webm [language]
//
// The key is read from the GROQ_API_KEY env var (not vocium-config.json) so
// it never lands in logs or shell history beyond what you set yourself.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ADAPTER_PATH = resolve(HERE, '../dist/core/stt/groq-stt.js');

// Groq Whisper accepted container types → MIME.
const MIME_BY_EXT = {
  '.webm': 'audio/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

// Throw instead of process.exit(): an immediate exit() while undici (fetch)
// handles are still closing trips a libuv assertion on Node 24 / Windows.
// The top-level catch sets exitCode and lets the event loop drain cleanly.
class ProbeError extends Error {}
const die = (msg) => { throw new ProbeError(msg); };

async function main() {
const apiKey = process.env.GROQ_API_KEY;
const model = process.env.GROQ_MODEL ?? 'whisper-large-v3-turbo';
const audioArg = process.argv[2];
const language = process.argv[3];

if (!apiKey) die('GROQ_API_KEY env var not set. PowerShell: $env:GROQ_API_KEY = "gsk_..."');
if (!audioArg) die('Missing audio file. Usage: node scripts/probe-groq.mjs <file> [language]');

const audioPath = resolve(process.cwd(), audioArg);
if (!existsSync(audioPath)) die(`Audio file not found: ${audioPath}`);

const ext = extname(audioPath).toLowerCase();
const mimeType = MIME_BY_EXT[ext];
if (!mimeType) {
  die(`Unsupported extension "${ext}". Use one of: ${Object.keys(MIME_BY_EXT).join(', ')}`);
}

if (!existsSync(ADAPTER_PATH)) {
  die(`Compiled adapter not found at ${ADAPTER_PATH}. Run "npm run build" first.`);
}

// Windows: dynamic import() needs a file:// URL, not a "D:\..." path.
const { GroqSttAdapter } = await import(pathToFileURL(ADAPTER_PATH).href);

const audio = await readFile(audioPath);
const adapter = new GroqSttAdapter({ apiKey, model }, { fetch: globalThis.fetch });

console.log(`→ model=${model}  file=${audioPath}  bytes=${audio.length}  mime=${mimeType}` +
  (language ? `  lang=${language}` : ''));

const t0 = performance.now();
try {
  const result = await adapter.transcribe({ audio, mimeType, language });
  const ms = Math.round(performance.now() - t0);
  console.log(`\x1b[32m✓ Groq OK in ${ms}ms\x1b[0m`);
  console.log('--- transcript ---');
  console.log(result.text || '(empty)');
  console.log('------------------');
} catch (err) {
  const ms = Math.round(performance.now() - t0);
  die(`Groq call failed after ${ms}ms: ${err?.message ?? err}`);
}
}

main().catch((err) => {
  console.error(`\x1b[31m✗ ${err instanceof ProbeError ? err.message : (err?.stack ?? err)}\x1b[0m`);
  process.exitCode = 1;
});
