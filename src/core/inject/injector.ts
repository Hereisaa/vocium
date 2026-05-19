// src/core/inject/injector.ts
import type { Injector, ProcDeps } from './types.js';
import { WindowsInjector } from './windows.js';
import { MacInjector } from './macos.js';
import { LinuxInjector } from './linux.js';

export function createInjector(platform: NodeJS.Platform, deps: ProcDeps): Injector {
  if (platform === 'win32') return new WindowsInjector(deps);
  if (platform === 'darwin') return new MacInjector(deps);
  return new LinuxInjector();
}
