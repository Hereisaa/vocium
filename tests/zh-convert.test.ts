// tests/zh-convert.test.ts
import { describe, it, expect } from 'vitest';
import { convertZh } from '../src/core/zh-convert.js';

describe('convertZh', () => {
  it("mode 'twp': Simplified -> Traditional(TW)", () => {
    expect(convertZh('软件', 'twp')).toBe('軟體');
    expect(convertZh('鼠标', 'twp')).toBe('滑鼠');
    expect(convertZh('这是简体', 'twp')).toBe('這是簡體');
  });
  it("mode 'twp': already-Traditional passes through", () => {
    expect(convertZh('軟體與滑鼠', 'twp')).toBe('軟體與滑鼠');
  });
  it("mode 'cn': Traditional(TW) -> Simplified", () => {
    expect(convertZh('軟體', 'cn')).toBe('软件');
    expect(convertZh('滑鼠', 'cn')).toBe('鼠标');
    expect(convertZh('這是繁體軟體與滑鼠', 'cn')).toBe('这是繁体软件与鼠标');
  });
  it("mode 'cn': already-Simplified passes through", () => {
    expect(convertZh('软件', 'cn')).toBe('软件');
  });
  it('modes are independent: twp and cn do not cross-contaminate', () => {
    expect(convertZh('软件', 'twp')).toBe('軟體');
    expect(convertZh('軟體', 'cn')).toBe('软件');
    expect(convertZh('鼠标', 'twp')).toBe('滑鼠');
    expect(convertZh('滑鼠', 'cn')).toBe('鼠标');
  });
  it('non-Han / empty / mixed pass through both modes, never throws', () => {
    expect(convertZh('', 'twp')).toBe('');
    expect(convertZh('', 'cn')).toBe('');
    expect(convertZh('abc 123 !@#', 'twp')).toBe('abc 123 !@#');
    expect(convertZh('hello 软件 ok', 'twp')).toBe('hello 軟體 ok');
    expect(convertZh('hello 軟體 ok', 'cn')).toBe('hello 软件 ok');
    expect(convertZh('😀🎉', 'cn')).toBe('😀🎉');
  });
  it('total: returns a string for any string input', () => {
    expect(typeof convertZh('随便', 'twp')).toBe('string');
    expect(typeof convertZh('隨便', 'cn')).toBe('string');
  });
});
