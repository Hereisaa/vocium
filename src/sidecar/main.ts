// src/sidecar/main.ts
// Standalone entry for the Bun --compile sidecar binary.
//
// `src/sidecar/index.ts` uses an `if (isMain)` guard that relies on
// `process.argv[1] === fileURLToPath(import.meta.url)` — true under
// `node dist/sidecar/index.js` (dev fallback), but FALSE under a
// Bun-compiled binary (argv[1] is the .exe path; import.meta.url is a
// Bun-internal URL). Without this file, the compiled binary would load,
// run the `isMain` check, return false, finish top-level, and exit 0
// before the MCP server is ever started — exactly the empty-response
// smoke failure on Windows (2026-05-20).
//
// This file is the binary's explicit unconditional starter and is the
// entry passed to `bun build --compile` in scripts/build-sidecar-bin.mjs.
// Tests / dev / other consumers continue to import `{ buildServer }`
// from './index.js' and never auto-start anything.
import { buildServer } from './index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

await buildServer().connect(new StdioServerTransport());
