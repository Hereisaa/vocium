// src/core/health.ts

export type HealthStatus = 'ok' | 'warn' | 'block';
export type HealthAction =
  | 'open_mic_settings'
  | 'open_a11y_settings'
  | 'open_settings_window'
  | 'open_settings_hotkey';
export type HealthId =
  | 'mic_device'
  | 'mic_perm'
  | 'mac_a11y'
  | 'stt_key'
  | 'hotkey';

export interface HealthItem {
  id: HealthId;
  status: HealthStatus;
  message?: string;
  action?: HealthAction;
}

export interface HealthReport {
  items: HealthItem[];
  blockers: HealthId[];
}

/** Map the WebView `PermissionStatus.state` value to a HealthStatus.
 *  - 'granted' → 'ok' (already authorised; getUserMedia will succeed)
 *  - 'prompt'  → 'ok' (no decision yet; let the OS prompt fire on first
 *                      getUserMedia — that is the standard, expected UX)
 *  - 'denied'  → 'block' (explicit refusal; toggle must not enter listening)
 *  - anything else → 'warn' (defensive: degrade gracefully if the
 *                            permissions API returns an unexpected value
 *                            instead of treating it as a hard failure) */
export function micPermToStatus(
  state: 'granted' | 'prompt' | 'denied' | string,
): HealthStatus {
  if (state === 'granted' || state === 'prompt') return 'ok';
  if (state === 'denied') return 'block';
  return 'warn';
}

/** Return the ids of items whose status is 'block'. The webview consults
 *  this list before invoking the toggle: a non-empty result means the FSM
 *  must NOT enter listening; the pill surfaces the first blocker's message
 *  via the existing showInjectError 8-second overlay. */
export function deriveBlockers(items: HealthItem[]): HealthId[] {
  return items.filter((it) => it.status === 'block').map((it) => it.id);
}

/** Default zh-TW name for each health item, used when the item has no
 *  per-instance message. */
const DEFAULT_NAME: Record<HealthId, string> = {
  mic_device: '麥克風',
  mic_perm: '麥克風權限',
  mac_a11y: '輔助使用',
  stt_key: 'STT 金鑰',
  hotkey: '全域快捷鍵',
};

/** Build the exact tray-menu label string for one health item. Format:
 *  `{glyph} {name}[:{message}][ → 點此開啟系統設定]`. The glyph is `✓`
 *  for ok and `⚠` for warn/block (macOS tray menus cannot color items;
 *  the character carries the visual signal). The `→ 點此開啟系統設定`
 *  hint is appended ONLY when the item is failing AND has an `action`
 *  that opens an OS settings page (mic_settings / a11y_settings); other
 *  actions (settings_window / settings_hotkey) do not get the hint. */
export function buildTrayLabel(item: HealthItem): string {
  const glyph = item.status === 'ok' ? '✓' : '⚠';
  const name = DEFAULT_NAME[item.id];
  const main = item.message ? `${name}:${item.message}` : name;
  const head = `${glyph} ${main.replace(':', '：')}`;
  const isFailing = item.status !== 'ok';
  const isOsAction =
    item.action === 'open_mic_settings' || item.action === 'open_a11y_settings';
  return isFailing && isOsAction ? `${head} → 點此開啟系統設定` : head;
}
