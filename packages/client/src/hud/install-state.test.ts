import { describe, expect, it } from 'vitest';
import { detectIos, installState } from './install-state.js';

const base = { standalone: false, hasPrompt: false, isIos: false };

describe('installState', () => {
  it('no instalable sin evento ni iOS', () => {
    expect(installState(base)).toBe('unavailable');
  });
  it('instalable cuando hay beforeinstallprompt', () => {
    expect(installState({ ...base, hasPrompt: true })).toBe('installable');
  });
  it('iOS muestra la indicación manual', () => {
    expect(installState({ ...base, isIos: true })).toBe('ios');
  });
  it('instalada tiene prioridad sobre todo lo demás', () => {
    expect(installState({ standalone: true, hasPrompt: true, isIos: true })).toBe('installed');
  });
  it('el evento tiene prioridad sobre la indicación de iOS', () => {
    expect(installState({ ...base, hasPrompt: true, isIos: true })).toBe('installable');
  });
});

describe('detectIos', () => {
  it('reconoce iPhone por user agent', () => {
    expect(detectIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'iPhone', 5)).toBe(true);
  });
  it('reconoce iPadOS que se hace pasar por Mac', () => {
    expect(detectIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
  });
  it('un Mac real o Windows no es iOS', () => {
    expect(detectIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
    expect(detectIos('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0)).toBe(false);
  });
});
