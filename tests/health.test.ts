// tests/health.test.ts
import { describe, it, expect } from 'vitest';
import {
  micPermToStatus,
  deriveBlockers,
  buildTrayLabel,
  type HealthItem,
} from '../src/core/health.js';

describe('micPermToStatus', () => {
  it("'granted' → 'ok'", () => expect(micPermToStatus('granted')).toBe('ok'));
  it("'prompt' → 'ok' (let OS prompt fire on first getUserMedia)", () =>
    expect(micPermToStatus('prompt')).toBe('ok'));
  it("'denied' → 'block'", () => expect(micPermToStatus('denied')).toBe('block'));
  it("unknown string → 'warn' (defensive, degrades gracefully)", () =>
    expect(micPermToStatus('something-else')).toBe('warn'));
});

describe('deriveBlockers', () => {
  it('returns ids of items with status "block"', () => {
    const items: HealthItem[] = [
      { id: 'mic_device', status: 'block' },
      { id: 'mic_perm', status: 'ok' },
      { id: 'stt_key', status: 'warn' },
    ];
    expect(deriveBlockers(items)).toEqual(['mic_device']);
  });
  it('empty list → empty blockers', () => expect(deriveBlockers([])).toEqual([]));
  it('all ok → empty blockers', () =>
    expect(deriveBlockers([{ id: 'mic_device', status: 'ok' }])).toEqual([]));
});

describe('buildTrayLabel', () => {
  it('ok mic device with count', () => {
    expect(
      buildTrayLabel({ id: 'mic_device', status: 'ok', message: '1 個裝置可用' }),
    ).toBe('✓ 麥克風：1 個裝置可用');
  });
  it('warn mac_a11y with action → appends 點此開啟系統設定', () => {
    expect(
      buildTrayLabel({
        id: 'mac_a11y',
        status: 'warn',
        message: '未授予',
        action: 'open_a11y_settings',
      }),
    ).toBe('⚠ 輔助使用：未授予 → 點此開啟系統設定');
  });
  it('block mic device without action', () => {
    expect(
      buildTrayLabel({
        id: 'mic_device',
        status: 'block',
        message: '找不到麥克風',
      }),
    ).toBe('⚠ 麥克風：找不到麥克風');
  });
  it('ok item with no message uses default Chinese name', () => {
    expect(buildTrayLabel({ id: 'hotkey', status: 'ok' })).toBe('✓ 全域快捷鍵');
  });
  it('block mic_perm with open_mic_settings action → appends hint', () => {
    expect(
      buildTrayLabel({
        id: 'mic_perm',
        status: 'block',
        action: 'open_mic_settings',
        message: '已拒絕',
      }),
    ).toBe('⚠ 麥克風權限：已拒絕 → 點此開啟系統設定');
  });
});
