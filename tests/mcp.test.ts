// tests/mcp.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/sidecar/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockInjector = { inject: async () => ({ ok: true }) };

let open: { client: Client; server: ReturnType<typeof buildServer> } | null = null;

async function connected(configDir?: string) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer({
    sttText: 'integration-text',
    injector: mockInjector,
    ...(configDir !== undefined ? { configDir } : {}),
  }); // test hook: force mock text + injector
  const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
  await Promise.all([server.connect(a), client.connect(b)]);
  open = { client, server };
  return { client, server };
}

afterEach(async () => {
  if (open) {
    const { client, server } = open;
    open = null;
    await Promise.all([client.close(), server.close()]);
  }
});

async function call(client: any, name: string, args: any = {}) {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content[0].text);
}

describe('MCP server', () => {
  it('lists the 9 tools', async () => {
    const { client } = await connected();
    const names = (await client.listTools()).tools.map((t: any) => t.name).sort();
    expect(names).toEqual(
      ['cancel','get_state','inject_text','polish_text','start_listening','stop_listening','submit_audio','toggle','transcribe_clip'].sort()
    );
  });

  it('get_state returns idle initially', async () => {
    const { client } = await connected();
    expect((await call(client, 'get_state')).state).toBe('idle');
  });

  it('transcribe_clip returns text without changing state (headless)', async () => {
    const { client } = await connected();
    const r = await call(client, 'transcribe_clip', { audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('integration-text');
    expect((await call(client, 'get_state')).state).toBe('idle');
  });

  it('toggle + submit_audio runs full pipeline back to idle', async () => {
    const { client } = await connected();
    await call(client, 'toggle'); // -> listening
    const r = await call(client, 'submit_audio', { audioBase64: 'AA==', mimeType: 'audio/webm' });
    expect(r.text).toBe('integration-text');
    expect((await call(client, 'get_state')).state).toBe('idle');
  });

  it('polish_text returns { text }, host-controlled, total (no key → input unchanged)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vocium-mcp-'));
    try {
      const { client } = await connected(tmp); // empty dir → no vocium-config.json → keyless + polishEnabled=false
      const r = await call(client, 'polish_text', { text: 'hello world', style: 'full' });
      expect(r).toEqual({ text: 'hello world' });          // keyless → polishText total passthrough
      // Host-control regression guard: a style-less call must still succeed and
      // return input unchanged (keyless). It fails if `polish_text` ever throws
      // or stops defaulting style → routing into polishText. (Both the keyless
      // and polishEnabled guards return input here, so this asserts the
      // contract/shape, not which guard fired.)
      const r2 = await call(client, 'polish_text', { text: 'hello world' }); // no style → defaults to 'light'
      expect(r2).toEqual({ text: 'hello world' });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('state_changed notification includes sttProvider (SPEC FR-MCP-2)', async () => {
    const { client } = await connected();
    const notifications: any[] = [];
    client.fallbackNotificationHandler = async (n: any) => {
      notifications.push(n);
    };
    await call(client, 'toggle'); // -> listening, triggers a state change
    const stateChanged = notifications.find(
      (n) => n.method === 'state_changed' || n.method?.endsWith('state_changed'),
    );
    expect(stateChanged).toBeDefined();
    expect(stateChanged.params.sttProvider).toBe('mock');
    expect(stateChanged.params.state).toBeDefined();
    expect(stateChanged.params.prev).toBeDefined();
  });
});
