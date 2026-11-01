// src/stt/list-models.ts
// On-demand model discovery. STT_MODELS / POLISH_MODELS (models.ts) stay the
// static, offline default; this module is only called when the user presses
// "Refresh model list" in Settings. The host keeps the result in memory — it
// is never written to the config file, so a stale or failed fetch can never
// break the static list.
import type { ModelOption } from './models.js';
import { fetchWithTimeout } from './with-timeout.js';

export type ListModelsProvider = 'groq' | 'openai' | 'gemini' | 'claude';

export interface ListModelsConfig {
  apiKey: string;
  /** OpenAI-compatible base URL (openai only). Defaults to api.openai.com/v1. */
  baseUrl?: string;
}

export interface ListModelsDeps { fetch: typeof fetch; }

/** Models bucketed by what Vocium can use them for. `other` keeps every id
 *  the rules could not classify so nothing the provider returned is lost. */
export interface ListedModels {
  stt: ModelOption[];
  polish: ModelOption[];
  other: ModelOption[];
}

/** Provider-agnostic shape the per-provider parsers normalise to before
 *  classification. `methods` is Gemini's supportedGenerationMethods. */
export interface RawModel { id: string; methods?: string[]; }

export const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const CLAUDE_MODELS_URL = 'https://api.anthropic.com/v1/models';
export const LIST_MODELS_TIMEOUT_MS = 15_000;

// ---- classification rules (deliberately simple, name-based) ----------------
const STT_RE = /whisper|transcribe/i;
// Anything clearly not a text chat model: speech, embeddings, safety
// classifiers, image/video generation, realtime audio sessions.
const NOT_CHAT_RE =
  /tts|speech|embedding|moderation|guard|image|dall-e|realtime|audio|sora|veo|imagen|aqa|rerank|vision-preview/i;
// Known text-chat families on OpenAI-compatible endpoints (Groq / OpenAI /
// third-party proxies). Unknown names fall through to `other`.
const CHAT_FAMILY_RE =
  /^(gpt-|o[1-9](-|$)|chatgpt-)|llama|mixtral|mistral|gemma|qwen|deepseek|kimi|gpt-oss|compound|claude|gemini/i;

function toOption(id: string): ModelOption {
  // Fetched ids carry no speed/cost hints; the id itself is the label.
  return { id, label: id, labelEn: id };
}

function byId(a: ModelOption, b: ModelOption): number {
  return a.id.localeCompare(b.id);
}

/** Pure bucketing step — exported so the rules are unit-testable without fetch. */
export function classifyModels(provider: ListModelsProvider, raw: RawModel[]): ListedModels {
  const out: ListedModels = { stt: [], polish: [], other: [] };
  const seen = new Set<string>();
  for (const m of raw) {
    const id = (m.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const opt = toOption(id);
    if (provider === 'gemini') {
      // Gemini multimodal chat models take audio input and generateContent, so
      // one model serves both roles. Embedding / image / video / TTS models
      // either lack generateContent or are excluded by name.
      const chat = (m.methods ?? []).includes('generateContent') && !NOT_CHAT_RE.test(id);
      if (chat) { out.stt.push(opt); out.polish.push(opt); } else out.other.push(opt);
    } else if (provider === 'claude') {
      // Anthropic only lists text/vision chat models; none do STT.
      out.polish.push(opt);
    } else if (STT_RE.test(id)) {
      out.stt.push(opt);
    } else if (!NOT_CHAT_RE.test(id) && CHAT_FAMILY_RE.test(id)) {
      out.polish.push(opt);
    } else {
      out.other.push(opt);
    }
  }
  out.stt.sort(byId); out.polish.sort(byId); out.other.sort(byId);
  return out;
}

// ---- per-provider response parsers -----------------------------------------
interface OpenAiList { data?: { id?: string }[] }
interface GeminiList { models?: { name?: string; supportedGenerationMethods?: string[] }[] }

function parseOpenAiLike(body: unknown, who: string): RawModel[] {
  const data = (body as OpenAiList | null)?.data;
  if (!Array.isArray(data)) throw new Error(`${who} models: unexpected response shape`);
  return data.map((m) => ({ id: String(m?.id ?? '') }));
}

function parseGemini(body: unknown): RawModel[] {
  const models = (body as GeminiList | null)?.models;
  if (!Array.isArray(models)) throw new Error('Gemini models: unexpected response shape');
  // The API returns "models/gemini-…"; adapters expect the bare id.
  return models.map((m) => ({
    id: String(m?.name ?? '').replace(/^models\//, ''),
    methods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
  }));
}

async function getJson(deps: ListModelsDeps, url: string, headers: Record<string, string>, who: string): Promise<unknown> {
  const res = await fetchWithTimeout(deps.fetch, url, { method: 'GET', headers }, LIST_MODELS_TIMEOUT_MS);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${who} models failed: ${res.status} ${detail}`.trim());
  }
  return res.json();
}

/** Fetch the provider's live model list and bucket it. Throws on missing key,
 *  non-2xx, timeout or an unrecognised response — the caller (Settings UI)
 *  shows the message next to the button and keeps the static list. */
export async function listModels(
  provider: ListModelsProvider,
  cfg: ListModelsConfig,
  deps: ListModelsDeps,
): Promise<ListedModels> {
  const key = (cfg.apiKey ?? '').trim();
  if (!key) throw new Error(`${provider} API key not configured`);
  const bearer = { Authorization: `Bearer ${key}` };
  let raw: RawModel[];
  switch (provider) {
    case 'groq':
      raw = parseOpenAiLike(await getJson(deps, GROQ_MODELS_URL, bearer, 'Groq'), 'Groq');
      break;
    case 'openai': {
      const base = (cfg.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
      raw = parseOpenAiLike(await getJson(deps, `${base}/models`, bearer, 'OpenAI'), 'OpenAI');
      break;
    }
    case 'gemini': {
      const url = `${GEMINI_MODELS_URL}?key=${encodeURIComponent(key)}&pageSize=1000`;
      raw = parseGemini(await getJson(deps, url, {}, 'Gemini'));
      break;
    }
    case 'claude':
      raw = parseOpenAiLike(
        await getJson(deps, `${CLAUDE_MODELS_URL}?limit=1000`,
          { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, 'Claude'),
        'Claude');
      break;
    default:
      throw new Error(`Unsupported provider: ${String(provider)}`);
  }
  return classifyModels(provider, raw);
}
