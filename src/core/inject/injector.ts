// src/core/inject/injector.ts
import type { Injector, ProcDeps } from './types.js';
import { NotImplementedError } from './types.js';
import { WindowsInjector } from './windows.js';
import { MacInjector } from './macos.js';

/** Vocium supports Windows and macOS. Any other platform is unsupported and
 *  fails fast with NotImplementedError. */
export function createInjector(platform: NodeJS.Platform, deps: ProcDeps): Injector {
  if (platform === 'win32') return new WindowsInjector(deps);
  if (platform === 'darwin') return new MacInjector(deps);
  throw new NotImplementedError(platform);
}
