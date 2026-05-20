// scripts/smoke-sidecar-bin.mjs
// Proves the Bun-compiled sidecar speaks MCP over stdio identically to
// `node dist/sidecar/main.js`: spawn it, do the JSON-RPC initialize
// handshake, call the side-effect-free `get_state` tool, assert a valid
// JSON-RPC response. Run where the binary exists (after build:sidecar-bin).
//
// Also a REGRESSION GUARD for the duplicate-paste bug: under Bun --compile,
// `import.meta.url === argv[1]` is true for every module in the bundle, so a
// stray `if (isMain) buildServer().connect(...)` block inside index.ts would
// spawn two servers — both attaching stdin listeners and BOTH responding to
// every JSON-RPC request. We detect that here by asserting exactly one
// response per request id (a second response to id=2 fails the smoke).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'app-tauri', 'src-tauri', 'binaries');
let bin;
try { bin = readdirSync(dir).find((f) => f.startsWith('vocium-sidecar-')); } catch { bin = undefined; }
if (!bin) { console.error('[smoke] no vocium-sidecar-* in', dir, '- run npm run build:sidecar-bin'); process.exit(1); }

const child = spawn(join(dir, bin), { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
let done = false;
const seenIds = new Map(); // id -> count, for double-response detection
const fail = (m) => { console.error('[smoke] FAIL:', m); try { child.kill(); } catch {} process.exit(1); };
const timer = setTimeout(() => fail('no response within 10s'), 10_000);

child.stdout.on('data', (d) => {
  buf += d.toString('utf8');
  for (let nl; (nl = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null) {
      const n = (seenIds.get(msg.id) ?? 0) + 1;
      seenIds.set(msg.id, n);
      if (n > 1) fail(`duplicate response for id=${msg.id} — sidecar double-started (regression of the isMain false-positive under Bun --compile)`);
    }
    if (msg.id === 1 && msg.result) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_state', arguments: {} } }) + '\n');
    } else if (msg.id === 2) {
      if (msg.result == null) fail('get_state returned no result: ' + line);
      // Wait a beat: if a phantom second server exists it would respond now.
      setTimeout(() => {
        clearTimeout(timer);
        done = true;
        console.log('[smoke] OK: get_state returned a single JSON-RPC result');
        try { child.kill(); } catch {}
        process.exit(0);
      }, 200);
    }
  }
});
child.on('exit', (c) => { if (!done) fail(`sidecar exited early (code ${c})`); });
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
}) + '\n');
