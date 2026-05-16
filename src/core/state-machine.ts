// src/core/state-machine.ts
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'injecting' | 'error';
export type VoiceEvent = 'TOGGLE' | 'CANCEL' | 'TRANSCRIBED' | 'INJECTED' | 'FAIL' | 'RESET';

const TABLE: Record<VoiceState, Partial<Record<VoiceEvent, VoiceState>>> = {
  idle:        { TOGGLE: 'listening' },
  listening:   { TOGGLE: 'transcribing', CANCEL: 'idle', FAIL: 'error' },
  transcribing:{ TRANSCRIBED: 'injecting', FAIL: 'error', CANCEL: 'idle' },
  injecting:   { INJECTED: 'idle', FAIL: 'error' },
  error:       { RESET: 'idle' },
};

export interface VoiceSessionOpts {
  onState: (next: VoiceState, prev: VoiceState) => void;
}

export function createVoiceSession({ onState }: VoiceSessionOpts) {
  let state: VoiceState = 'idle';
  return {
    getState: () => state,
    send(event: VoiceEvent) {
      const next = TABLE[state][event];
      if (!next || next === state) return; // unknown/ignored or no change
      const prev = state;
      state = next;
      onState(state, prev);
    },
  };
}
