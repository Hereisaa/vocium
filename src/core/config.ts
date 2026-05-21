// src/core/config.ts
export type SttProvider = 'groq' | 'openai' | 'gemini' | 'mock';

export interface VociumConfig {
  hotkey: string;
  cancelKey: string;
  sttProvider: SttProvider;
  groqApiKey: string;
  groqModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl: string;
  geminiApiKey: string;
  geminiModel: string;
  mockText: string;
  maxListenMs: number;
  iconOffsetX: number;
  dragLocked: boolean;
  zhConvert: 'twp' | 'cn';
  lang: 'zh-TW' | 'en';
  inputMode: 'toggle' | 'ptt';
  vadTrim: boolean;
  micDeviceId: string;
  polishEnabled: boolean;
  polishProvider: 'groq' | 'openai' | 'gemini' | 'claude';
  polishModel: string;
  polishStyle: 'light' | 'full' | 'custom';
  polishCustomPrompt: string;
  polishApiKey: string;
  claudeApiKey: string;
}

export const DEFAULTS: VociumConfig = {
  hotkey: 'Ctrl+Shift+Space',
  cancelKey: 'Escape',
  sttProvider: 'groq',
  groqApiKey: '',
  groqModel: 'whisper-large-v3-turbo',
  openaiApiKey: '',
  openaiModel: 'whisper-1',
  openaiBaseUrl: 'https://api.openai.com/v1',
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash',
  mockText: '這是一段由 Vocium 模擬語音輸入產生的文字。',
  maxListenMs: 30000,
  iconOffsetX: 0,
  dragLocked: false,
  zhConvert: 'twp',
  lang: 'zh-TW',
  inputMode: 'toggle',
  vadTrim: false,
  micDeviceId: '',
  polishEnabled: false,
  polishProvider: 'groq',
  polishModel: 'llama-3.3-70b-versatile',
  polishStyle: 'light',
  polishCustomPrompt: '',
  polishApiKey: '',
  claudeApiKey: '',
};

const VALID_PROVIDERS: ReadonlySet<string> = new Set(['groq', 'openai', 'gemini', 'mock']);
function normalizeProvider(v: unknown): SttProvider {
  return typeof v === 'string' && VALID_PROVIDERS.has(v) ? (v as SttProvider) : 'groq';
}

const POLISH_PROVIDERS: ReadonlySet<string> = new Set(['groq', 'openai', 'gemini', 'claude']);
function normalizePolishProvider(v: unknown): 'groq' | 'openai' | 'gemini' | 'claude' {
  return typeof v === 'string' && POLISH_PROVIDERS.has(v)
    ? (v as 'groq' | 'openai' | 'gemini' | 'claude') : 'groq';
}
function normalizePolishStyle(v: unknown): 'light' | 'full' | 'custom' {
  return v === 'full' || v === 'custom' ? v : 'light';
}

interface FsLike {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc?: string): string;
  writeFileSync(p: string, data: string): void;
  mkdirSync(p: string, opts?: { recursive?: boolean }): void;
}
interface PathLike { join(...xs: string[]): string; }

const FILE = 'vocium-config.json';

export function saveConfig(fs: FsLike, path: PathLike, dir: string, cfg: VociumConfig): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(cfg, null, 2));
}

export function loadConfig(fs: FsLike, path: PathLike, dir: string): VociumConfig {
  const file = path.join(dir, FILE);
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const merged = { ...DEFAULTS, ...parsed } as VociumConfig;
      merged.sttProvider = normalizeProvider(merged.sttProvider);
      if (merged.inputMode !== 'ptt') merged.inputMode = 'toggle';
      merged.lang = merged.lang === 'en' ? 'en' : 'zh-TW';
      merged.vadTrim = merged.vadTrim === true;
      merged.polishProvider = normalizePolishProvider(merged.polishProvider);
      merged.polishStyle = normalizePolishStyle(merged.polishStyle);
      merged.polishEnabled = merged.polishEnabled === true;
      return merged;
    } catch {
      // keep corrupt file intact to avoid destroying a recoverable groqApiKey
      return { ...DEFAULTS };
    }
  }
  saveConfig(fs, path, dir, DEFAULTS);
  return { ...DEFAULTS };
}

/** Read ONLY the zhConvert mode. Never writes (unlike loadConfig). Missing
 *  file / corrupt JSON / absent or invalid value → DEFAULTS.zhConvert ('twp').
 *  Never throws. */
export function readZhMode(fs: FsLike, path: PathLike, dir: string): 'twp' | 'cn' {
  try {
    const file = path.join(dir, FILE);
    if (!fs.existsSync(file)) return DEFAULTS.zhConvert;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed?.zhConvert === 'cn' || parsed?.zhConvert === 'twp'
      ? parsed.zhConvert : DEFAULTS.zhConvert;
  } catch {
    return DEFAULTS.zhConvert;
  }
}

export interface PolishConfig {
  polishEnabled: boolean;
  polishProvider: 'groq' | 'openai' | 'gemini' | 'claude';
  polishModel: string;
  polishStyle: 'light' | 'full' | 'custom';
  polishCustomPrompt: string;
  polishApiKey: string;
  claudeApiKey: string;
  groqApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
}

/** Read ONLY the polish-relevant fields, live. Never writes, never throws.
 *  Missing/corrupt/invalid → safe defaults (mirrors readZhMode). */
export function readPolishConfig(fs: FsLike, path: PathLike, dir: string): PolishConfig {
  const d: PolishConfig = {
    polishEnabled: DEFAULTS.polishEnabled,
    polishProvider: DEFAULTS.polishProvider,
    polishModel: DEFAULTS.polishModel,
    polishStyle: DEFAULTS.polishStyle,
    polishCustomPrompt: DEFAULTS.polishCustomPrompt,
    polishApiKey: '', claudeApiKey: '',
    groqApiKey: '', openaiApiKey: '', geminiApiKey: '',
  };
  try {
    const file = path.join(dir, FILE);
    if (!fs.existsSync(file)) return d;
    const p = JSON.parse(fs.readFileSync(file, 'utf8')) ?? {};
    const str = (k: string) => (typeof p[k] === 'string' ? p[k] : '');
    return {
      polishEnabled: p.polishEnabled === true,
      polishProvider: normalizePolishProvider(p.polishProvider),
      polishModel: str('polishModel') || DEFAULTS.polishModel,
      polishStyle: normalizePolishStyle(p.polishStyle),
      polishCustomPrompt: str('polishCustomPrompt'),
      polishApiKey: str('polishApiKey'),
      claudeApiKey: str('claudeApiKey'),
      groqApiKey: str('groqApiKey'),
      openaiApiKey: str('openaiApiKey'),
      geminiApiKey: str('geminiApiKey'),
    };
  } catch {
    return d;
  }
}
