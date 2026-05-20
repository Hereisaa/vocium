// scripts/build-sidecar-bin.mjs
// Compile the Node sidecar into a single self-contained binary via Bun, named
// per Tauri's externalBin `<name>-<target-triple>` convention.
import { execSync } from 'node:child_process';
import { existsSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'app-tauri', 'src-tauri', 'binaries');
const ext = process.platform === 'win32' ? '.exe' : '';
// main.ts (not index.ts): under Bun --compile the `isMain` guard in
// index.ts is false (argv[1]=exe path, import.meta.url=internal) and the
// binary exits before starting the server. main.ts is an explicit starter.
const entry = join(root, 'src', 'sidecar', 'main.ts');

try {
  execSync('bun --version', { stdio: 'ignore' });
} catch {
  console.error(
    '[build-sidecar-bin] Bun is required (build-time only). Install:\n' +
    '  Windows: powershell -c "irm bun.sh/install.ps1|iex"\n' +
    '  macOS:   curl -fsSL https://bun.sh/install | bash',
  );
  process.exit(1);
}

try {
  execSync('rustc --version', { stdio: 'ignore' });
} catch {
  console.error('[build-sidecar-bin] rustc not found (Rust toolchain required)');
  process.exit(1);
}

const triple = execSync('rustc --print host-tuple').toString().trim();
if (!triple) { console.error('[build-sidecar-bin] could not get rustc host-tuple'); process.exit(1); }

mkdirSync(outDir, { recursive: true });
const staged = join(outDir, `vocium-sidecar${ext}`);
const final = join(outDir, `vocium-sidecar-${triple}${ext}`);

console.log(`[build-sidecar-bin] bun compile ${entry} -> ${final}`);
execSync(`bun build "${entry}" --compile --outfile "${staged}"`, { stdio: 'inherit' });
if (!existsSync(staged)) { console.error('[build-sidecar-bin] bun produced no output'); process.exit(1); }
renameSync(staged, final);
console.log(`[build-sidecar-bin] OK: ${final}`);
