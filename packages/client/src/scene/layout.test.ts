import { describe, expect, it } from 'vitest';
import {
  CAMERA,
  DECK_POSITION,
  DISCARD_POSITION,
  MAX_SLOTS,
  TABLE_HEIGHT,
  cameraPose,
  characterAnchors,
  distance,
  fovForAspect,
  projectToNdc,
  rivalAngles,
  seatPosition,
  slotPositions,
  tableRadius,
  type CameraPoseId,
} from './layout.js';
import { faceColor, patternFor, paletteFor } from './palette.js';

const deg = (r: number): number => (r * 180) / Math.PI;
const POSES: CameraPoseId[] = ['table', 'totems'];
/** 16:9 de portátil, 4:3 de tableta/ventana estrecha y móvil horizontal 812×375. */
const ASPECTS = [16 / 9, 4 / 3, 812 / 375];
/** Medio tótem visto desde arriba: la casilla entera tiene que caber, no solo su centro. */
const TOTEM_HALF = { w: 0.04, d: 0.055 };

describe('WP-09 · geometría de la mesa (docs/01 §11)', () => {
  it('tus 8 slots, huecos incluidos, tienen siempre posición propia', () => {
    for (let n = 1; n <= MAX_SLOTS; n++) {
      const ps = slotPositions(n, 0, 4, { own: true });
      expect(ps).toHaveLength(n);
      for (const p of ps) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  // D-042: la barra 2D enseña los slots 0..7 de izquierda a derecha, así que la
  // fila 3D tiene que ir en el mismo orden EN PANTALLA. Mirando desde -Z hacia +Z,
  // la izquierda de la pantalla es +X: antes el test exigía x creciente, que dejaba
  // el slot 0 a la derecha y contradecía la barra.
  it('los slots propios van de izquierda a derecha en pantalla y no se solapan', () => {
    for (const total of [2, 4, 6]) {
      const ps = slotPositions(MAX_SLOTS, 0, total, { own: true });
      const pose = cameraPose('table', total);
      const xs = ps.map((p) => projectToNdc(pose, 16 / 9, p).x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      for (let i = 1; i < ps.length; i++) {
        expect(distance(ps[i - 1]!, ps[i]!)).toBeGreaterThan(TOTEM_HALF.w * 2); // ancho de tótem
      }
    }
  });

  it('los slots propios caen delante de la cámara (parte inferior de la pantalla)', () => {
    const ps = slotPositions(MAX_SLOTS, 0, 4, { own: true });
    for (const p of ps) {
      expect(p.z).toBeGreaterThan(CAMERA.position.z); // entre cámara y centro
      expect(p.z).toBeLessThan(0);
      expect(distance(p, CAMERA.position)).toBeLessThan(1.2);
    }
  });

  it('los asientos se reparten sin solaparse para 2..6 jugadores', () => {
    for (let n = 2; n <= 6; n++) {
      const seats = Array.from({ length: n }, (_, i) => seatPosition(i, n));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(distance(seats[i]!, seats[j]!), `n=${n}`).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('mazo y descarte están en el centro, separados', () => {
    expect(distance(DECK_POSITION, DISCARD_POSITION)).toBeGreaterThan(0.25);
    expect(Math.hypot(DECK_POSITION.x, DECK_POSITION.z)).toBeLessThan(0.4);
  });
});

describe('WP-18 · herradura de asientos (docs/01 §11, D-042)', () => {
  it('reparte los rivales con los ángulos de la tabla del documento', () => {
    const expected: Record<number, number[]> = {
      2: [180],
      3: [125, 235],
      4: [110, 180, 250],
      5: [100, 153, 207, 260],
      6: [100, 140, 180, 220, 260],
    };
    for (let n = 2; n <= 6; n++) {
      const got = rivalAngles(n).map((a) => Math.round(deg(a)));
      const want = expected[n]!;
      expect(got).toHaveLength(want.length);
      got.forEach((g, i) => expect(Math.abs(g - want[i]!), `n=${n}`).toBeLessThanOrEqual(1));
    }
  });

  it('todos los rivales quedan dentro de [100°, 260°]: nunca a tu lado ni detrás', () => {
    for (let n = 2; n <= 6; n++) {
      for (const a of rivalAngles(n)) {
        expect(deg(a)).toBeGreaterThanOrEqual(99.5);
        expect(deg(a)).toBeLessThanOrEqual(260.5);
      }
    }
  });

  it('la mesa crece con 5–6 jugadores', () => {
    expect(tableRadius(6)).toBeGreaterThan(tableRadius(4));
    expect(tableRadius(2)).toBe(tableRadius(4));
  });

  it('el asiento 1 aparece a la izquierda de la pantalla y el último a la derecha', () => {
    for (let n = 3; n <= 6; n++) {
      const pose = cameraPose('table', n);
      const first = projectToNdc(pose, 16 / 9, characterAnchors(1, n).head);
      const last = projectToNdc(pose, 16 / 9, characterAnchors(n - 1, n).head);
      expect(first.x).toBeLessThan(last.x);
    }
  });
});

describe('WP-18 · requisito duro: tus tótems siempre visibles (docs/01 §11)', () => {
  for (const pose of POSES) {
    for (const slots of [4, 8]) {
      it(`pose «${pose}», ${slots} slots, 2–6 jugadores y tres proporciones`, () => {
        for (let n = 2; n <= 6; n++) {
          const cam = cameraPose(pose, n);
          for (const aspect of ASPECTS) {
            const ps = slotPositions(slots, 0, n, { own: true });
            for (const p of ps) {
              // Las cuatro esquinas del tótem, no solo su centro.
              for (const [dx, dz] of [
                [-TOTEM_HALF.w, -TOTEM_HALF.d],
                [TOTEM_HALF.w, -TOTEM_HALF.d],
                [-TOTEM_HALF.w, TOTEM_HALF.d],
                [TOTEM_HALF.w, TOTEM_HALF.d],
              ] as const) {
                const q = projectToNdc(cam, aspect, { x: p.x + dx, y: p.y, z: p.z + dz });
                const where = `pose=${pose} n=${n} aspect=${aspect.toFixed(2)}`;
                expect(q.z, where).toBeGreaterThan(0); // delante de la cámara
                expect(Math.abs(q.x), where).toBeLessThan(0.97);
                expect(q.y, where).toBeGreaterThan(-0.97);
                expect(q.y, where).toBeLessThan(0.97);
              }
            }
          }
        }
      });
    }
  }

  it('en la pose «mesa» tus tótems ocupan la franja inferior', () => {
    for (let n = 2; n <= 6; n++) {
      const cam = cameraPose('table', n);
      for (const p of slotPositions(8, 0, n, { own: true })) {
        expect(projectToNdc(cam, 16 / 9, p).y).toBeLessThan(-0.3);
      }
    }
  });

  it('en la pose «mis tótems» se ven más grandes y en la mitad inferior', () => {
    const size = (pose: CameraPoseId): number => {
      const cam = cameraPose(pose, 4);
      const [a, b] = slotPositions(8, 0, 4, { own: true });
      const qa = projectToNdc(cam, 16 / 9, a!);
      const qb = projectToNdc(cam, 16 / 9, b!);
      return Math.hypot(qa.x - qb.x, qa.y - qb.y);
    };
    expect(size('totems')).toBeGreaterThan(size('table') * 1.25);
    const cam = cameraPose('totems', 4);
    for (const p of slotPositions(8, 0, 4, { own: true })) {
      expect(projectToNdc(cam, 16 / 9, p).y).toBeLessThan(0);
    }
  });

  it('en pantallas estrechas el FOV vertical se abre para conservar el horizontal', () => {
    expect(fovForAspect(55, 16 / 9)).toBe(55);
    expect(fovForAspect(55, 4 / 3)).toBeGreaterThan(55);
    const hfov = (v: number, aspect: number): number =>
      2 * deg(Math.atan(Math.tan((v * Math.PI) / 360) * aspect));
    expect(hfov(fovForAspect(55, 4 / 3), 4 / 3)).toBeGreaterThanOrEqual(79.9);
  });
});

describe('WP-18 · rivales y anclajes de personaje', () => {
  it('en la pose «mesa» se ven la cabeza y la fila de tótems de cada rival', () => {
    for (let n = 2; n <= 6; n++) {
      const cam = cameraPose('table', n);
      for (let seat = 1; seat < n; seat++) {
        const head = projectToNdc(cam, 16 / 9, characterAnchors(seat, n).head);
        expect(head.y, `n=${n} seat=${seat}`).toBeGreaterThan(0.05);
        expect(head.y, `n=${n} seat=${seat}`).toBeLessThan(0.95);
        // Los de los extremos pueden quedar cortados (como en el formato de
        // referencia), pero su cabeza no se sale del todo.
        expect(Math.abs(head.x), `n=${n} seat=${seat}`).toBeLessThan(1.05);
        for (const p of slotPositions(8, seat, n)) {
          const q = projectToNdc(cam, 16 / 9, p);
          expect(Math.abs(q.x), `slot n=${n} seat=${seat}`).toBeLessThan(0.98);
          expect(q.z).toBeGreaterThan(0);
        }
      }
    }
  });

  it('las manos descansan sobre la mesa y la placa flota sobre la cabeza', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seat = 1; seat < n; seat++) {
        const a = characterAnchors(seat, n);
        for (const h of [a.handRestL, a.handRestR]) {
          expect(h.y).toBeGreaterThanOrEqual(TABLE_HEIGHT);
          expect(Math.hypot(h.x, h.z)).toBeLessThan(tableRadius(n));
        }
        expect(a.plate.y).toBeGreaterThan(a.head.y);
        expect(a.head.y).toBeGreaterThan(TABLE_HEIGHT + 0.3);
      }
    }
  });

  it('cada rival mira al centro de la mesa', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seat = 1; seat < n; seat++) {
        const a = characterAnchors(seat, n);
        // Hacia delante del personaje (+Z local girado por `facing`) apunta al centro.
        const fx = Math.sin(a.facing);
        const fz = Math.cos(a.facing);
        const toCenter = { x: -a.seat.x, z: -a.seat.z };
        const len = Math.hypot(toCenter.x, toCenter.z);
        expect(fx * (toCenter.x / len) + fz * (toCenter.z / len)).toBeGreaterThan(0.999);
      }
    }
  });

  it('su fila de tótems está al alcance de la mano y entre él y el centro', () => {
    for (let n = 2; n <= 6; n++) {
      for (let seat = 1; seat < n; seat++) {
        const a = characterAnchors(seat, n);
        for (const p of slotPositions(8, seat, n)) {
          expect(distance(p, a.shoulderR)).toBeLessThan(a.armLength);
          expect(Math.hypot(p.x, p.z)).toBeLessThan(Math.hypot(a.seat.x, a.seat.z));
        }
      }
    }
  });
});

describe('WP-15 · accesibilidad del color (docs/01 §11)', () => {
  it('cada valor tiene un patrón distinto, no solo color', () => {
    const patterns = new Set(Array.from({ length: 14 }, (_, v) => patternFor(v)));
    expect(patterns.size).toBe(14);
  });

  it('el modo daltónico cambia los colores de acierto y peligro', () => {
    expect(paletteFor(true).mystic).not.toBe(paletteFor(false).mystic);
    expect(paletteFor(true).danger).not.toBe(paletteFor(false).danger);
  });

  it('la rampa de caras es monótona y está acotada', () => {
    for (let v = 0; v <= 13; v++) expect(faceColor(v, false)).toMatch(/^hsl\(/);
    expect(faceColor(-5, false)).toBe(faceColor(0, false));
    expect(faceColor(99, false)).toBe(faceColor(13, false));
  });
});
