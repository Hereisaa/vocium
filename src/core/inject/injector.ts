// src/core/inject/injector.ts
import type { Injector } from './types.js';
import { WindowsInjector, type WinDeps } from './windows.js';
import { MacInjector } from './macos.js';
import { LinuxInjector } from './linux.js';

export function createInjector(platform: NodeJS.Platform, winDeps: WinDeps): Injector {
  if (platform === 'win32') return new WindowsInjector(winDeps);
  if (platform === 'darwin') return new MacInjector();
  return new LinuxInjector();
}
