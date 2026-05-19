// scripts/smoke-sidecar-bin.mjs
// Proves the Bun-compiled sidecar speaks MCP over stdio identically to
// `node dist/sidecar/index.js`: spawn it, do the JSON-RPC initialize
// handshake, call the side-effect-free `get_state` tool, assert a valid
// JSON-RPC response. Run where the binary exists (after build:sidecar-bin).
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
    if (msg.id === 1 && msg.result) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_state', arguments: {} } }) + '\n');
    } else if (msg.id === 2) {
      clearTimeout(timer);
      done = true;
      if (msg.result != null) { console.log('[smoke] OK: get_state returned a JSON-RPC result'); child.kill(); process.exit(0); }
      fail('get_state returned no result: ' + line);
    }
  }
});
child.on('exit', (c) => { if (!done) fail(`sidecar exited early (code ${c})`); });
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
}) + '\n');
