// tests/state-machine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createVoiceSession } from '../src/core/state-machine.js';

describe('voice session state machine', () => {
  it('runs idle→listening→transcribing→injecting→idle', () => {
    const onState = vi.fn();
    const s = createVoiceSession({ onState });
    expect(s.getState()).toBe('idle');
    s.send('TOGGLE'); expect(s.getState()).toBe('listening');
    s.send('TOGGLE'); expect(s.getState()).toBe('transcribing');
    s.send('TRANSCRIBED'); expect(s.getState()).toBe('injecting');
    s.send('INJECTED'); expect(s.getState()).toBe('idle');
    expect(onState).toHaveBeenCalledTimes(4);
    expect(onState).toHaveBeenLastCalledWith('idle', 'injecting');
  });

  it('CANCEL from listening returns to idle', () => {
    const s = createVoiceSession({ onState: () => {} });
    s.send('TOGGLE'); s.send('CANCEL');
    expect(s.getState()).toBe('idle');
  });

  it('CANCEL from transcribing returns to idle', () => {
    const s = createVoiceSession({ onState: () => {} });
    s.send('TOGGLE'); s.send('TOGGLE'); // -> transcribing
    expect(s.getState()).toBe('transcribing');
    s.send('CANCEL');
    expect(s.getState()).toBe('idle');
  });

  it('FAIL goes to error, RESET returns to idle', () => {
    const s = createVoiceSession({ onState: () => {} });
    s.send('TOGGLE'); s.send('TOGGLE'); s.send('FAIL');
    expect(s.getState()).toBe('error');
    s.send('RESET'); expect(s.getState()).toBe('idle');
  });

  it('ignores TOGGLE while transcribing/injecting (reentry guard)', () => {
    const onState = vi.fn();
    const s = createVoiceSession({ onState });
    s.send('TOGGLE'); s.send('TOGGLE'); // -> transcribing
    onState.mockClear();
    s.send('TOGGLE'); // ignored
    expect(s.getState()).toBe('transcribing');
    expect(onState).not.toHaveBeenCalled();
  });
});
