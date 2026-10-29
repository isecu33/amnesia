/**
 * HUD diegética (#8, variante D «Inmersiva»): todo el estado de la partida vive
 * en objetos 3D de la mesa; no hay capa 2D. Es una capa de escena «tonta»: recibe
 * `HudIndicators` (ya calculados por `presenter/hud-model.ts`) y los pinta.
 *
 *  - vela-reloj: se consume con el plazo del jugador activo; roja y más rápida al final.
 *  - halo de presagio, llamas de cadena y aro cian de Robo de efecto (reglas v2:
 *    apagados mientras `HudModel` no reciba datos, ver `presenter/hud-v2.ts`).
 *  - tótem de piedra de tres pisos para ¡ÚLTIMA! (PROVISIONAL, #8).
 *  - teclas y números grabados en la madera, color fijo y sin animación.
 *  - la carta bloqueada se apaga en `CardSet` (`light`); aquí solo su número.
 * Regla general: nada de parpadeos ni letras que laten.
 */
import * as THREE from 'three';
import type { HudIndicators, KeyGlyph, SlotState } from '../presenter/hud-model.js';
import { KEY_OF_GLYPH } from '../presenter/hud-model.js';
import { paletteFor } from './palette.js';
import {
  BELL_POSITION,
  CANDLE_POSITION,
  DECK_POSITION,
  DISCARD_POSITION,
  MAX_SLOTS,
  TABLE_HEIGHT,
  characterAnchors,
  slotPositions,
} from './layout.js';

export interface HudLayerOptions {
  colorBlind: boolean;
  reducedMotion: boolean;
  /** números grandes (ajuste de accesibilidad) */
  bigNumbers: boolean;
}

export type HudHit = { kind: 'totem' } | { kind: 'key'; key: string };

const CANDLE_H = 0.24;
const IDLE_H = 0.12;
const MIN_H = 0.02;
const FLAME = 0xffb35c;
const CARVE_OFF = 0x5e3f22;
const CARVE_LEGAL = 0xffe2a6;
const CARVE_PICK = 0xfff2d2;
const DIGIT_IDLE = 0xb88a52;
const STONE = 0xa88c66;
const DEAD_EYE = 0x2a1e16;
const TIER_H = 0.06;
const ON_TABLE = TABLE_HEIGHT + 0.022;
const MAX_SEATS = 6;
const MAX_LINKS = 5;
const MOTES = 8;
const DIGIT_SIZE = 0.07;
const BIG_DIGIT_SCALE = 1.45;
const SELECTED_SCALE = 1.25;
const KEY_SIZE = 0.1;
const DANGER_BLUE = 0x4da6ff;

/** Dónde se graba cada tecla (x, z): +X es la izquierda de tu pantalla. */
const KEY_SPOTS: Record<KeyGlyph, readonly [number, number]> = {
  R: [DECK_POSITION.x, -0.115],
  F: [DISCARD_POSITION.x, -0.115],
  S: [0.14, -0.205],
  X: [DISCARD_POSITION.x, -0.205],
  O: [0, -0.205],
  ENTER: [0.28, -0.205],
  Q: [0.28, -0.115],
  W: [0.4, -0.115],
  E: [DISCARD_POSITION.x - 0.1, -0.1],
  U: [BELL_POSITION.x, BELL_POSITION.z - 0.13],
  L: [0.4, -0.205],
};
const GLYPH_TEXT: Record<KeyGlyph, string> = {
  R: 'R',
  F: 'F',
  S: 'S',
  X: 'X',
  O: 'O',
  ENTER: '↵',
  Q: 'Q',
  W: 'W',
  E: 'E',
  U: 'U',
  L: 'L',
};

type Carving = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
type Flame = THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
type Flat = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

/** Glifo pixel grabado en la madera (plano tumbado, legible desde tu asiento). */
function carving(text: string, size: number): Carving {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    g.font = 'bold 13px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Contorno oscuro de 1 px: la letra grabada se lee sobre la madera clara u oscura.
    g.fillStyle = '#000';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) g.fillText(text, 8 + dx, 9 + dy);
    g.fillStyle = '#fff';
    g.fillText(text, 8, 9);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: CARVE_OFF, depthWrite: false }),
  );
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  return m;
}

function flame(size: number): Flame {
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0).scale(1, 1.7, 1),
    new THREE.MeshBasicMaterial({ color: FLAME, fog: false }),
  );
}

function flatRing(inner: number, outer: number, color: number): Flat {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(DISCARD_POSITION.x, ON_TABLE, DISCARD_POSITION.z);
  return m;
}

export class HudLayer {
  readonly root = new THREE.Group();
  /** Tótem de ¡ÚLTIMA! (clicable: es la antigua campana). */
  readonly totem = new THREE.Group();
  private readonly candles: { wax: THREE.Mesh; fire: Flame }[] = [];
  private readonly links: Flame[] = [];
  private readonly omenRing: Flat;
  private readonly motes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly stealRing: Flat;
  private readonly tiers: { eyes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] }[] = [];
  private readonly crown: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly digits: Carving[] = [];
  private readonly letters = new Map<KeyGlyph, Carving>();
  private readonly totemBlocks: THREE.Mesh[] = [];
  private readonly glow = new THREE.PointLight(0xe0565b, 0, 1.2, 1.4);
  private readonly tmpColor = new THREE.Color();

  constructor(private opts: HudLayerOptions) {
    const waxGeo = new THREE.CylinderGeometry(0.03, 0.034, 1, 6).translate(0, 0.5, 0);
    const waxMat = new THREE.MeshLambertMaterial({ color: 0xf2e8d5, flatShading: true });
    for (let i = 0; i < MAX_SEATS; i++) {
      const wax = new THREE.Mesh(waxGeo, waxMat);
      const fire = flame(0.026);
      this.candles.push({ wax, fire });
      this.root.add(wax, fire);
    }
    for (let i = 0; i < MAX_LINKS; i++) {
      const f = flame(0.016);
      this.links.push(f);
      this.root.add(f);
    }
    this.omenRing = flatRing(0.1, 0.115, FLAME);
    this.stealRing = flatRing(0.15, 0.18, paletteFor(opts.colorBlind).mystic);
    this.root.add(this.omenRing, this.stealRing);
    for (let i = 0; i < MOTES; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.008, 0.008),
        new THREE.MeshBasicMaterial({ color: FLAME, fog: false }),
      );
      this.motes.push(m);
      this.root.add(m);
    }

    // ¡ÚLTIMA!: tótem de piedra antiguo; cada piso con ojos rojos encendidos es un turno que queda.
    const stone = new THREE.MeshLambertMaterial({ color: STONE, emissive: 0x4a3a28, flatShading: true });
    const widths = [0.075, 0.065, 0.055] as const;
    widths.forEach((w, i) => {
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, TIER_H, w), stone);
      block.position.y = TIER_H * (i + 0.5);
      block.userData['hud'] = { kind: 'totem' } satisfies HudHit;
      this.totem.add(block);
      this.totemBlocks.push(block);
      const eyes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
      for (const dx of [-0.017, 0.017]) {
        const eye = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.014, 0.004),
          new THREE.MeshBasicMaterial({ color: DEAD_EYE, fog: false }),
        );
        eye.position.set(dx, TIER_H * (i + 0.62), -w / 2 - 0.002);
        eyes.push(eye);
        this.totem.add(eye);
      }
      const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.008, 0.004),
        new THREE.MeshBasicMaterial({ color: DEAD_EYE }),
      );
      mouth.position.set(0, TIER_H * (i + 0.28), -w / 2 - 0.002);
      this.totem.add(mouth);
      this.tiers.push({ eyes });
    });
    // Alas talladas en el piso central y una corona que se enciende con la ¡ÚLTIMA!.
    for (const dx of [-0.05, 0.05]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), stone);
      wing.position.set(dx, TIER_H * 1.6, 0);
      wing.userData['hud'] = { kind: 'totem' } satisfies HudHit;
      this.totem.add(wing);
      this.totemBlocks.push(wing);
    }
    this.crown = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.022, 0).scale(1, 1.6, 1),
      new THREE.MeshBasicMaterial({ color: DEAD_EYE, fog: false }),
    );
    this.crown.position.y = TIER_H * 3 + 0.03;
    this.totem.add(this.crown);
    this.totem.name = 'ultima-totem';
    this.totem.position.set(BELL_POSITION.x, TABLE_HEIGHT, BELL_POSITION.z);
    this.root.add(this.totem);

    for (let i = 0; i < MAX_SLOTS; i++) {
      const d = carving(String(i + 1), DIGIT_SIZE);
      this.digits.push(d);
      this.root.add(d);
    }
    for (const g of Object.keys(KEY_SPOTS) as KeyGlyph[]) {
      const [x, z] = KEY_SPOTS[g];
      const l = carving(GLYPH_TEXT[g], KEY_SIZE);
      l.position.set(x, ON_TABLE, z);
      l.userData['hud'] = { kind: 'key', key: KEY_OF_GLYPH[g] } satisfies HudHit;
      this.letters.set(g, l);
      this.root.add(l);
    }
    this.glow.position.set(BELL_POSITION.x, TABLE_HEIGHT + 0.3, BELL_POSITION.z);
    this.root.add(this.glow);
  }

  setOptions(opts: Partial<HudLayerOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.stealRing.material.color.setHex(paletteFor(this.opts.colorBlind).mystic);
  }

  /** Objetos sobre los que el raycaster decide si has tocado el tótem o una tecla viva. */
  pickTargets(): THREE.Object3D[] {
    return [...this.totemBlocks, ...this.letters.values()];
  }

  /** Qué es lo tocado, o null si es una tecla apagada (solo lo legal reacciona). */
  hitOf(obj: THREE.Object3D): HudHit | null {
    const hit = obj.userData['hud'] as HudHit | undefined;
    if (!hit) return null;
    if (hit.kind === 'key' && obj.userData['live'] !== true) return null;
    return hit;
  }

  /** Pinta el estado. `seats` = jugadores en la mesa; `slotCount` = tus slots (huecos incluidos). */
  update(ind: HudIndicators, t: number, seats: number, slotCount: number): void {
    const motion = this.opts.reducedMotion ? 0 : 1;
    this.layoutCandles(ind, t * motion, seats);
    this.layoutChain(ind, t * motion);
    this.layoutOmen(ind, t * motion);
    this.layoutSteal(ind);
    this.layoutTotem(ind, t * motion);
    this.layoutDigits(ind, seats, slotCount);
    this.layoutKeys(ind);
  }

  private layoutCandles(ind: HudIndicators, t: number, seats: number): void {
    const palette = paletteFor(this.opts.colorBlind);
    const dangerColor = this.opts.colorBlind ? DANGER_BLUE : palette.danger;
    this.candles.forEach(({ wax, fire }, i) => {
      const on = i < seats;
      wax.visible = fire.visible = on;
      if (!on) return;
      const p = i === 0 ? CANDLE_POSITION : characterAnchors(i, seats).candle;
      const c = ind.candle?.seat === i ? ind.candle : undefined;
      const h = c ? MIN_H + (CANDLE_H - MIN_H) * c.frac : IDLE_H;
      const danger = !!c?.danger;
      const sung = ind.ultima?.seat === i;
      wax.position.set(p.x, TABLE_HEIGHT, p.z);
      wax.scale.set(1, h, 1);
      // Más rápida al final; sin movimiento (reducir movimiento) la llama queda quieta pero más grande.
      const speed = danger ? 30 : 12;
      const base = c ? 1.6 : 0.9;
      const k = base * (danger ? 1.25 : 1) * (1 + Math.sin(t * speed + i) * (danger ? 0.25 : 0.1));
      fire.scale.setScalar(k);
      fire.position.set(p.x, TABLE_HEIGHT + h + 0.03 * k, p.z);
      fire.material.color.setHex(sung ? palette.danger : danger ? dangerColor : FLAME);
    });
  }

  private layoutChain(ind: HudIndicators, t: number): void {
    const n = Math.min(MAX_LINKS, ind.chainLinks);
    this.links.forEach((f, i) => {
      f.visible = i < n;
      f.position.set(
        DISCARD_POSITION.x - 0.11 - i * 0.04,
        TABLE_HEIGHT + 0.03 + Math.sin(t * 9 + i) * 0.004,
        DISCARD_POSITION.z,
      );
      f.scale.setScalar(1 + Math.sin(t * 14 + i * 2) * 0.15);
    });
  }

  private layoutOmen(ind: HudIndicators, t: number): void {
    const color = ind.omen?.color;
    const on = color !== undefined;
    this.omenRing.visible = on;
    this.motes.forEach((m) => (m.visible = on));
    if (color === undefined) return;
    this.omenRing.material.color.setHex(color);
    this.omenRing.material.opacity = this.opts.reducedMotion ? 0.7 : 0.55 + Math.sin(t * 2) * 0.25;
    this.motes.forEach((m, i) => {
      const a = t * 0.8 + (i / MOTES) * Math.PI * 2;
      m.material.color.setHex(color);
      m.position.set(
        DISCARD_POSITION.x + Math.cos(a) * 0.11,
        TABLE_HEIGHT + 0.03 + ((t * 0.05 + i / MOTES) % 1) * 0.12,
        DISCARD_POSITION.z + Math.sin(a) * 0.11,
      );
    });
  }

  private layoutSteal(ind: HudIndicators): void {
    const f = ind.steal?.frac;
    this.stealRing.visible = f !== undefined;
    if (f === undefined) return;
    this.stealRing.scale.setScalar(0.4 + f * 1.6);
    this.stealRing.material.opacity = 0.85;
  }

  private layoutTotem(ind: HudIndicators, t: number): void {
    const u = ind.ultima;
    const danger = paletteFor(this.opts.colorBlind).danger;
    // Los pisos se apagan de arriba abajo según pasan los turnos; el brillo respira despacio, sin parpadeos.
    const glow = this.opts.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 2.2);
    this.tiers.forEach(({ eyes }, i) => {
      const lit = !!u && i < u.turnsLeft;
      for (const e of eyes) e.material.color.setHex(DEAD_EYE).lerp(this.tmpColor.setHex(danger), lit ? glow : 0);
    });
    this.crown.material.color.setHex(DEAD_EYE).lerp(this.tmpColor.setHex(FLAME), u ? glow : 0);
    this.crown.rotation.y = u ? t * 0.8 : 0;
    this.crown.scale.setScalar(u ? 1 + 0.08 * Math.sin(t * 2.2) : 1);
    this.glow.color.setHex(danger);
    this.glow.intensity = u ? 1.2 + 0.6 * glow : 0;
  }

  private layoutDigits(ind: HudIndicators, seats: number, slotCount: number): void {
    const spots = slotPositions(slotCount, 0, seats, { own: true });
    const big = this.opts.bigNumbers ? BIG_DIGIT_SCALE : 1;
    this.digits.forEach((d, i) => {
      const p = spots[i];
      const state: SlotState = ind.digits[i] ?? 'empty';
      d.visible = !!p && state !== 'empty' && i < slotCount;
      if (!p || !d.visible) return;
      d.position.set(p.x, ON_TABLE, p.z - 0.09 * big);
      const strong = state === 'selected' || state === 'picked';
      d.scale.setScalar(big * (strong ? SELECTED_SCALE : 1));
      const hex = strong ? CARVE_PICK : state === 'legal' ? CARVE_LEGAL : DIGIT_IDLE;
      // El número sigue el mismo factor de luz que su carta (bloqueada = apagada).
      d.material.color.setHex(hex).multiplyScalar(ind.lockLight);
    });
  }

  private layoutKeys(ind: HudIndicators): void {
    const big = this.opts.bigNumbers ? BIG_DIGIT_SCALE : 1;
    for (const [g, l] of this.letters) {
      const st = ind.keys[g];
      l.userData['live'] = st !== 'off';
      l.scale.setScalar(big * (st === 'armed' ? SELECTED_SCALE : 1));
      // Color fijo, sin animación: cálido si es legal, tallado apagado si no.
      l.material.color.setHex(st === 'armed' ? CARVE_PICK : st === 'legal' ? CARVE_LEGAL : CARVE_OFF);
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.root.removeFromParent();
  }
}
