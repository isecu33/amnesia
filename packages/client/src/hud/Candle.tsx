import { useEffect, useState } from 'react';
import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/** Reloj de turno diegético: una vela que se consume (docs/01 §11). */
export function Candle({ view }: { view: PlayerView }): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const big = useSettings((s) => s.bigNumbers);
  const [now, setNow] = useState(Date.now());
  const timer = view.timers[view.timers.length - 1];

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  if (!timer) return null;
  // `tick` del servidor es un reloj en ms: estimamos el desfase con el local.
  const remainMs = Math.max(0, timer.deadlineTick - view.tick - (now - lastSync(view.tick)));
  const totalMs = Math.max(1000, timer.deadlineTick - view.tick);
  const pct = Math.max(0, Math.min(1, remainMs / totalMs));

  return (
    <div className="candle" title={t('candleClock')} aria-label={t('candleClock')}>
      <div className="candle-flame" style={{ opacity: pct > 0.05 ? 1 : 0.2 }} />
      <div className="candle-body">
        <div className="candle-wax" style={{ height: `${pct * 100}%` }} />
      </div>
      <span className={big ? 'big' : ''}>{Math.ceil(remainMs / 1000)}</span>
    </div>
  );
}

let syncTick = 0;
let syncAt = Date.now();
function lastSync(tick: number): number {
  if (tick !== syncTick) {
    syncTick = tick;
    syncAt = Date.now();
  }
  return syncAt;
}
