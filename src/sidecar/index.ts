// src/sidecar/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createVoiceSession } from '../core/state-machine.js';
import { MockSttAdapter } from '../core/stt/mock-stt.js';
import { createSttAdapter } from '../core/stt/stt-adapter.js';
import { createInjector } from '../core/inject/injector.js';
import type { Injector } from '../core/inject/types.js';
import { loadConfig } from '../core/config.js';
import { createPipeline } from './pipeline.js';
import { registerTools } from './mcp-tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface BuildOpts { sttText?: string; configDir?: string; injector?: Injector; }

export function buildServer(opts: BuildOpts = {}): McpServer {
  const server = new McpServer({ name: 'vocium', version: '0.1.0' });

  const stt = opts.sttText !== undefined
    ? new MockSttAdapter({ text: opts.sttText, delayMs: 0 })
    : createSttAdapter(
        loadConfig(fs as any, path as any, opts.configDir ?? configDir()),
        { fetch: globalThis.fetch },
      );
  const effectiveProvider = (stt instanceof MockSttAdapter) ? 'mock' : 'groq';

  const emitState = (state: string, prev: string) => {
    server.server.notification({
      method: 'state_changed',
      params: { state, prev, sttProvider: effectiveProvider },
    }).catch(() => {});
  };
  const session = createVoiceSession({ onState: emitState });

  const injector = opts.injector ?? createInjector(process.platform, {
    execFile: execFile as any,
    // Long-lived PowerShell host (Windows): reused per inject (~ms) instead of
    // a ~100–300ms powershell.exe cold start every paste. windowsHide avoids a
    // console flash; the injector falls back to one-shot execFile if unusable.
    spawn: ((c: string, a: string[]) => spawn(c, a, { windowsHide: true })) as any,
  });
  const pipeline = createPipeline({ session, stt, injector });
  registerTools(server, pipeline);
  if (!opts.injector) void injector.warmup?.();
  return server;
}

function configDir(): string {
  const base = process.env.APPDATA
    ?? path.join(process.env.HOME ?? '.', '.config');
  return path.join(base, 'vocium');
}

// Entry point: only run stdio transport when executed directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const server = buildServer();
  server.connect(new StdioServerTransport());
}
