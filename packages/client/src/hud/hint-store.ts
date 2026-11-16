/**
 * Instrucción actual de la placa de turno: la publica `TurnPlate` y la pinta el
 * dock de acciones (así el texto no tapa la cara del rival de enfrente).
 */
import { useSyncExternalStore } from 'react';

let current: string | undefined;
const subs = new Set<() => void>();

export function setHint(text: string | undefined): void {
  if (text === current) return;
  current = text;
  for (const f of subs) f();
}

const subscribe = (f: () => void): (() => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const useHint = (): string | undefined =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => undefined,
  );
