// src/sidecar/mcp-tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { createPipeline } from './pipeline.js';

type Pipeline = ReturnType<typeof createPipeline>;
const ok = (obj: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj) }] });
const audioShape = { audioBase64: z.string(), mimeType: z.string(), language: z.string().optional() };

export function registerTools(server: McpServer, p: Pipeline) {
  server.tool('get_state', {}, async () => ok({ state: p.getState() }));
  server.tool('toggle', {}, async () => ok({ state: p.toggle() }));
  server.tool('start_listening', {}, async () => {
    if (p.getState() === 'idle') p.toggle();
    return ok({ state: p.getState() });
  });
  server.tool('stop_listening', {}, async () => {
    if (p.getState() === 'listening') p.toggle();
    return ok({ state: p.getState() });
  });
  server.tool('cancel', {}, async () => ok({ state: p.cancel() }));
  server.tool('submit_audio', audioShape, async (a) => ok(await p.submitAudio(a)));
  server.tool('transcribe_clip', audioShape, async (a) => ok(await p.transcribeClip(a)));
  server.tool('inject_text', { text: z.string() }, async (a) => ok(await p.injectText(a.text)));
}
