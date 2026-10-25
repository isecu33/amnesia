/** WP-18 · estado de las poses de cámara (docs/01 §11, D-042). */
import { describe, expect, it } from 'vitest';
import {
  DRAG_POSE_PX,
  initialRig,
  onDrag,
  onRelease,
  setPose,
  stepRig,
  togglePose,
} from './camera-rig.js';
import { MAX_YAW } from './layout.js';

describe('poses de cámara', () => {
  it('empieza en la pose «mesa», mirando al centro', () => {
    const s = initialRig();
    expect(s.pose).toBe('table');
    expect(s.yaw).toBe(0);
    expect(s.blend).toBe(0);
  });

  it('Space / botón alterna entre «mesa» y «mis tótems»', () => {
    const a = togglePose(initialRig());
    expect(a.pose).toBe('totems');
    expect(togglePose(a).pose).toBe('table');
    expect(setPose(a, 'totems')).toBe(a); // sin cambio, mismo objeto
  });

  it('la transición dura ≤ 0,3 s y llega exactamente a la pose', () => {
    let s = togglePose(initialRig());
    s = stepRig(s, 150, false);
    expect(s.blend).toBeGreaterThan(0);
    expect(s.blend).toBeLessThan(1);
    s = stepRig(s, 160, false);
    expect(s.blend).toBe(1);
  });

  it('arrastrar hacia abajo baja la mirada a tus tótems y hacia arriba la levanta', () => {
    const down = onDrag(initialRig(), 0, DRAG_POSE_PX + 1, 1000, false);
    expect(down.pose).toBe('totems');
    const up = onDrag(onRelease(down), 0, -(DRAG_POSE_PX + 1), 1000, false);
    expect(up.pose).toBe('table');
  });

  it('el giro lateral se limita a ±30° y vuelve solo al centro al soltar', () => {
    let s = onDrag(initialRig(), -5000, 0, 1000, false);
    expect(s.yaw).toBeCloseTo(MAX_YAW);
    s = onDrag(s, 10000, 0, 1000, false);
    expect(s.yaw).toBeCloseTo(-MAX_YAW);
    s = onRelease(s);
    for (let i = 0; i < 120; i++) s = stepRig(s, 16, false);
    expect(Math.abs(s.yaw)).toBeLessThan(0.01);
  });

  it('mientras arrastras el giro no vuelve al centro', () => {
    let s = onDrag(initialRig(), -300, 0, 1000, false);
    const yaw = s.yaw;
    s = stepRig(s, 500, false);
    expect(s.yaw).toBe(yaw);
  });

  it('«menos movimiento»: sin giro y cambio de pose instantáneo', () => {
    let s = onDrag(initialRig(), -500, 0, 1000, true);
    expect(s.yaw).toBe(0);
    s = stepRig(togglePose(s), 1, true);
    expect(s.blend).toBe(1);
  });
});
