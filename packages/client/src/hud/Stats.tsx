import { useEffect, useState } from 'react';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import type { World } from '../scene/world.js';

/**
 * Overlay de medición para el presupuesto de docs/02 §5.3 (60 fps, ≤ 80 draw
 * calls). Se activa con `?stats=1`; es la herramienta para cerrar la CA de WP-09.
 */
export function Stats({ world }: { world: World | undefined }): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const [s, setS] = useState({ drawCalls: 0, triangles: 0, fps: 0, programs: 0 });
  const on = new URLSearchParams(globalThis.location?.search ?? '').get('stats') === '1';

  useEffect(() => {
    if (!on || !world) return;
    const id = setInterval(() => setS(world.stats), 500);
    return () => clearInterval(id);
  }, [on, world]);

  if (!on) return null;
  const over = s.drawCalls > 80;
  const slow = s.fps > 0 && s.fps < 55;
  return (
    <div className="stats" role="status">
      <span className={slow ? 'danger' : ''}>
        {s.fps} {t('statsFps')}
      </span>
      <span className={over ? 'danger' : ''}>
        {s.drawCalls} {t('statsDraws')}
      </span>
      <span>{s.triangles} △</span>
    </div>
  );
}
