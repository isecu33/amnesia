/**
 * I2 en cliente (D-041). El vislumbre inicial se escribía en el log permanente
 * («👁 0 = 5») y se quedaba ahí toda la ronda: en un juego de MEMORIA eso anula
 * la mecánica central. Estas pruebas fijan que la información privada caduca y
 * que el log no sobrevive a un cambio de ronda.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store.js';

const reset = (): void => useStore.getState().clearLog();

describe('privacidad del log de subtítulos', () => {
  beforeEach(reset);

  it('una línea sin TTL es permanente (eventos públicos)', () => {
    useStore.getState().addLog('A roba del mazo');
    useStore.getState().expireLog(Date.now() + 60_000);
    expect(useStore.getState().log).toHaveLength(1);
  });

  it('una línea con TTL desaparece al caducar', () => {
    useStore.getState().addLog('👁 0 = 5', 1_000);
    expect(useStore.getState().log).toHaveLength(1);
    useStore.getState().expireLog(Date.now() + 999);
    expect(useStore.getState().log).toHaveLength(1);
    useStore.getState().expireLog(Date.now() + 1_001);
    expect(useStore.getState().log).toHaveLength(0);
  });

  it('caducan solo las privadas: las públicas se quedan', () => {
    useStore.getState().addLog('B canta ÚLTIMA');
    useStore.getState().addLog('👁 2 = 9', 500);
    useStore.getState().expireLog(Date.now() + 1_000);
    const texts = useStore.getState().log.map((l) => l.text);
    expect(texts).toEqual(['B canta ÚLTIMA']);
  });

  it('una ronda nueva empieza con el log limpio', () => {
    useStore.getState().addLog('línea de la ronda anterior');
    useStore.getState().clearLog();
    expect(useStore.getState().log).toHaveLength(0);
  });

  it('ninguna línea persistente contiene un valor de carta revelado en privado', () => {
    useStore.getState().addLog('👁 0 = 5', 1_000);
    useStore.getState().addLog('👁 1 = 12', 1_000);
    useStore.getState().expireLog(Date.now() + 2_000);
    const dump = JSON.stringify(useStore.getState().log);
    expect(dump).not.toMatch(/👁/);
  });
});
