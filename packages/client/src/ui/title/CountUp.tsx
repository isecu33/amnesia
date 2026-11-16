/**
 * Número que sube de 0 a `value` (puntuaciones). El valor final está siempre
 * en el DOM para lectores de pantalla; lo animado es aria-hidden. Con movimiento
 * reducido se muestra el valor directamente.
 */
import { useState } from 'react';
import { useFrameLoop, useReducedMotion } from './motion.js';

const DURATION_MS = 900;
const FPS = 30;

export function CountUp({ value, delayMs = 0 }: { value: number; delayMs?: number }): JSX.Element {
  const reduced = useReducedMotion();
  const canAnimate = typeof globalThis.requestAnimationFrame === 'function';
  const [shown, setShown] = useState(canAnimate ? 0 : value);
  const done = shown === value;
  useFrameLoop(
    (t) => {
      const k = Math.min(1, Math.max(0, (t - delayMs) / DURATION_MS));
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(value * eased));
    },
    FPS,
    !reduced && !done,
  );
  const visible = reduced ? value : shown;
  return (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
