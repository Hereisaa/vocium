// src/core/inject/macos.ts
import type { Injector, InjectResult } from './types.js';
import { NotImplementedError } from './types.js';
export class MacInjector implements Injector {
  async inject(_t: string): Promise<InjectResult> { throw new NotImplementedError('darwin'); }
}
