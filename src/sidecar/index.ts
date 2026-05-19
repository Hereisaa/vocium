// src/sidecar/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createVoiceSession } from '../core/state-machine.js';
import { MockSttAdapter } from '../core/stt/mock-stt.js';
import { createSttAdapter } from '../core/stt/stt-adapter.js';
import { resolveActive } from '../core/stt/resolve-active.js';
import { createInjector } from '../core/inject/injector.js';
import type { Injector } from '../core/inject/types.js';
import { loadConfig, readZhMode, readPolishConfig } from '../core/config.js';
import { polishText, resolvePolishKey } from '../core/polish/polish.js';
import { createPipeline } from './pipeline.js';
import { registerTools } from './mcp-tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface BuildOpts { sttText?: string; configDir?: string; injector?: Injector; }

export function buildServer(opts: BuildOpts = {}): McpServer {
  const server = new McpServer({ name: 'vocium', version: '0.1.0' });

  const cfgDir = opts.configDir ?? configDir();
  const cfg = loadConfig(fs as any, path as any, cfgDir);
  const active = resolveActive(cfg);
  const mockMode = opts.sttText !== undefined || active.mockMode;
  const noKey = opts.sttText === undefined && active.noKey;
  const stt = opts.sttText !== undefined
    ? new MockSttAdapter({ text: opts.sttText, delayMs: 0 })
    : createSttAdapter(cfg, { fetch: globalThis.fetch });
  const effectiveProvider = (mockMode || noKey) ? 'mock' : active.provider;

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
  const pipeline = createPipeline({
    session, stt, injector, noKey,
    // live read per call — picks up the setting change without sidecar restart
    getZhMode: () => readZhMode(fs as any, path as any, cfgDir),
    polish: async (text: string, styleOverride?: 'light' | 'full' | 'custom') => {
      const pc = readPolishConfig(fs as any, path as any, cfgDir);
      // GUI auto-path respects the toggle; the polish_text MCP tool passes a
      // styleOverride and must work regardless of polishEnabled.
      if (styleOverride === undefined && !pc.polishEnabled) return text;
      return polishText(
        text,
        {
          provider: pc.polishProvider,
          model: pc.polishModel,
          style: styleOverride ?? pc.polishStyle,
          customPrompt: pc.polishCustomPrompt,
          apiKey: resolvePolishKey(pc),
        },
        { fetch: globalThis.fetch },
      );
    },
  });
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
