// src/core/config.ts
export interface VociumConfig {
  hotkey: string;
  cancelKey: string;
  sttProvider: 'groq' | 'mock';
  groqApiKey: string;
  groqModel: string;
  mockText: string;
  maxListenMs: number;
  iconOffsetX: number;
  dragLocked: boolean;
  zhConvert: 'twp' | 'cn';
}

export const DEFAULTS: VociumConfig = {
  hotkey: 'Ctrl+Shift+Space',
  cancelKey: 'Escape',
  sttProvider: 'groq',
  groqApiKey: '',
  groqModel: 'whisper-large-v3-turbo',
  mockText: '這是一段由 Vocium 模擬語音輸入產生的文字。',
  maxListenMs: 30000,
  iconOffsetX: 0,
  dragLocked: false,
  zhConvert: 'twp',
};

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
      return { ...DEFAULTS, ...parsed };
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
