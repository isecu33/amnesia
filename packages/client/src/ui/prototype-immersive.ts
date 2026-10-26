// PROTOTYPE (wayfinder «Interfaz y HUD de Amnesia», variante D) — throwaway.
// Todo el estado vive en la mesa 3D: vela-reloj que se consume, llamas de cadena,
// halo de presagio, campana que se agita, teclas grabadas en la madera.
import * as THREE from 'three';
import {
  BELL_POSITION,
  CANDLE_POSITION,
  DISCARD_POSITION,
  TABLE_HEIGHT,
  characterAnchors,
  slotPositions,
} from '../scene/layout.js';

export interface ImmersiveState {
  total: number;
  activeSeat: number;
  /** 0..1 de vela restante del jugador activo */
  timerFrac: number;
  omenColor?: number;
  chainLinks: number;
  /** 0..1 de ventana de Robo de efecto restante */
  stealFrac?: number;
  ultima?: { seat: number; turnsLeft: number };
  locked?: { slot: number; frac: number };
  slots: number;
  slotsLegal: boolean;
  keys: string[];
}

const CANDLE_H = 0.24;
const IDLE_H = 0.12;
const FLAME = 0xffb35c;
const DANGER = 0xff4a2a;
const ULTIMA = 0xe0565b;
const STEAL = 0x7be0c8;
const CARVE = 0xd2a366;
const COIN = 0xffe3b0;
const ON_TABLE = TABLE_HEIGHT + 0.022;
const MAX_SEATS = 6;
const MAX_LINKS = 5;
const MOTES = 8;

/** Glifo pixel grabado en la madera (plano tumbado, legible desde tu asiento). */
function carving(text: string, size = 0.07): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
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
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: CARVE, depthWrite: false }),
  );
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  return m;
}

/** Candado pixel 16×16 en rojo, grabado junto al número del slot bloqueado. */
function padlock(): ReturnType<typeof carving> {
  const m = carving('');
  const c = (m.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#fff';
    g.fillRect(5, 2, 6, 2);
    g.fillRect(4, 3, 2, 5);
    g.fillRect(10, 3, 2, 5);
    g.fillRect(3, 7, 10, 7);
    g.clearRect(7, 9, 2, 3);
  }
  m.material.color.setHex(ULTIMA);
  return m;
}

function flame(size: number): THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial> {
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0).scale(1, 1.7, 1),
    new THREE.MeshBasicMaterial({ color: FLAME, fog: false }),
  );
}

export class ImmersiveLayer {
  readonly root = new THREE.Group();
  private readonly candles: { wax: THREE.Mesh; fire: ReturnType<typeof flame> }[] = [];
  private readonly links: ReturnType<typeof flame>[] = [];
  private readonly omenRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly motes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly stealRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly coins: THREE.Mesh[] = [];
  private readonly digits: ReturnType<typeof carving>[] = [];
  private readonly letters = new Map<string, ReturnType<typeof carving>>();
  private readonly lock: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly padlock: ReturnType<typeof carving>;
  private slotSpots: THREE.Vector3[] = [];
  private readonly stealLight = new THREE.PointLight(STEAL, 0, 0.9, 1.4);
  private readonly bellLight = new THREE.PointLight(ULTIMA, 0, 1.2, 1.4);

  constructor(
    private readonly bell: THREE.Object3D | undefined,
    private readonly discard: THREE.Object3D | undefined,
  ) {
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
    const flat = (inner: number, outer: number, color: number): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(DISCARD_POSITION.x, ON_TABLE, DISCARD_POSITION.z);
      return m;
    };
    this.omenRing = flat(0.1, 0.115, FLAME);
    this.stealRing = flat(0.15, 0.18, STEAL);
    this.root.add(this.omenRing, this.stealRing);
    for (let i = 0; i < MOTES; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.008, 0.008),
        new THREE.MeshBasicMaterial({ color: FLAME, fog: false }),
      );
      this.motes.push(m);
      this.root.add(m);
    }
    const coinGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 8);
    const coinMat = new THREE.MeshBasicMaterial({ color: COIN, fog: false });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(coinGeo, coinMat);
      c.position.set(BELL_POSITION.x + 0.07 - i * 0.07, ON_TABLE, BELL_POSITION.z - 0.18);
      this.coins.push(c);
      this.root.add(c);
    }
    for (let i = 0; i < 8; i++) {
      const d = carving(String(i + 1));
      this.digits.push(d);
      this.root.add(d);
    }
    const place = (k: string, x: number, z: number): void => {
      const l = carving(k, 0.11);
      l.position.set(x, ON_TABLE, z);
      this.letters.set(k, l);
      this.root.add(l);
    };
    place('X', DISCARD_POSITION.x, DISCARD_POSITION.z - 0.12);
    place('E', DISCARD_POSITION.x - 0.1, DISCARD_POSITION.z - 0.1);
    place('U', BELL_POSITION.x + 0.19, BELL_POSITION.z - 0.18);
    this.lock = new THREE.Mesh(
      new THREE.PlaneGeometry(0.085, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x0a0610, transparent: true, depthWrite: false }),
    );
    this.lock.rotation.x = -Math.PI / 2;
    this.padlock = padlock();
    this.root.add(this.lock, this.padlock);
    this.stealLight.position.set(DISCARD_POSITION.x, TABLE_HEIGHT + 0.25, DISCARD_POSITION.z);
    this.bellLight.position.set(BELL_POSITION.x, TABLE_HEIGHT + 0.3, BELL_POSITION.z);
    this.root.add(this.stealLight, this.bellLight);
  }

  update(s: ImmersiveState, t: number): void {
    this.layoutCandles(s, t);
    this.layoutChain(s, t);
    this.layoutOmen(s, t);
    this.layoutSteal(s, t);
    this.layoutBell(s, t);
    this.layoutCarvings(s);
  }

  private layoutCandles(s: ImmersiveState, t: number): void {
    this.candles.forEach(({ wax, fire }, i) => {
      const on = i < s.total;
      wax.visible = fire.visible = on;
      if (!on) return;
      const p = i === 0 ? CANDLE_POSITION : characterAnchors(i, s.total).candle;
      const active = i === s.activeSeat;
      const h = active ? 0.02 + (CANDLE_H - 0.02) * s.timerFrac : IDLE_H;
      wax.position.set(p.x, TABLE_HEIGHT, p.z);
      wax.scale.set(1, h, 1);
      const danger = active && s.timerFrac < 0.25;
      const sung = s.ultima?.seat === i;
      const speed = danger ? 30 : 12;
      const k = (active ? 1.6 : 0.9) * (1 + Math.sin(t * speed + i) * (danger ? 0.25 : 0.1));
      fire.scale.setScalar(k);
      fire.position.set(p.x, TABLE_HEIGHT + h + 0.03 * k, p.z);
      fire.material.color.setHex(sung ? ULTIMA : danger ? DANGER : FLAME);
    });
  }

  private layoutChain(s: ImmersiveState, t: number): void {
    const n = Math.min(MAX_LINKS, s.chainLinks);
    this.links.forEach((f, i) => {
      f.visible = i < n;
      const x = DISCARD_POSITION.x - 0.11;
      f.position.set(x - i * 0.04, TABLE_HEIGHT + 0.03 + Math.sin(t * 9 + i) * 0.004, DISCARD_POSITION.z);
      f.scale.setScalar(1 + Math.sin(t * 14 + i * 2) * 0.15);
    });
  }

  private layoutOmen(s: ImmersiveState, t: number): void {
    const on = s.omenColor !== undefined;
    this.omenRing.visible = on;
    this.motes.forEach((m) => (m.visible = on));
    if (s.omenColor === undefined) return;
    this.omenRing.material.color.setHex(s.omenColor);
    this.omenRing.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
    this.motes.forEach((m, i) => {
      const a = t * 0.8 + (i / MOTES) * Math.PI * 2;
      m.material.color.setHex(s.omenColor ?? FLAME);
      m.position.set(
        DISCARD_POSITION.x + Math.cos(a) * 0.11,
        TABLE_HEIGHT + 0.03 + ((t * 0.05 + i / MOTES) % 1) * 0.12,
        DISCARD_POSITION.z + Math.sin(a) * 0.11,
      );
    });
  }

  private layoutSteal(s: ImmersiveState, t: number): void {
    const f = s.stealFrac;
    this.stealRing.visible = f !== undefined;
    this.stealLight.intensity = f !== undefined ? 2.5 + Math.sin(t * 25) * 1.5 : 0;
    if (this.discard) this.discard.position.y = DISCARD_POSITION.y + (f !== undefined ? 0.03 + Math.sin(t * 6) * 0.003 : 0);
    if (f === undefined) return;
    this.stealRing.scale.setScalar(0.4 + f * 1.6);
    this.stealRing.material.opacity = 0.85;
  }

  private layoutBell(s: ImmersiveState, t: number): void {
    const u = s.ultima;
    this.coins.forEach((c, i) => (c.visible = !!u && i < u.turnsLeft));
    this.bellLight.intensity = u ? 2 + Math.sin(t * 8) * 1.5 : 0;
    if (!this.bell) return;
    this.bell.rotation.z = u ? Math.sin(t * 16) * 0.3 * (0.6 + 0.4 * Math.abs(Math.sin(t * 1.5))) : 0;
    const mat = (this.bell as THREE.Mesh).material as THREE.MeshLambertMaterial;
    mat.emissive?.setHex(u ? (Math.sin(t * 8) > 0 ? 0x601010 : 0x200000) : 0x000000);
  }

  private layoutCarvings(s: ImmersiveState): void {
    this.slotSpots = slotPositions(s.slots, 0, s.total, { own: true }).map(
      (p) => new THREE.Vector3(p.x, p.y, p.z),
    );
    this.digits.forEach((d, i) => {
      const p = this.slotSpots[i];
      d.visible = !!p;
      if (!p) return;
      d.position.set(p.x, ON_TABLE, p.z - 0.09);
      const locked = s.locked?.slot === i;
      d.material.color.setHex(locked ? ULTIMA : s.slotsLegal ? FLAME : CARVE);
    });
    for (const [k, l] of this.letters) {
      const lit = s.keys.includes(k);
      // Sin parpadeos: la tecla grabada solo se aviva en tono cálido; el robo lo cuenta el aro.
      l.visible = k !== 'E';
      l.material.color.setHex(lit ? FLAME : CARVE);
    }
    const lk = s.locked;
    const spot = lk ? this.slotSpots[lk.slot] : undefined;
    this.lock.visible = this.padlock.visible = !!spot;
    if (lk && spot) {
      // La carta bloqueada se apaga y va recuperando la luz según pasa el castigo.
      this.lock.position.set(spot.x, TABLE_HEIGHT + 0.03, spot.z);
      this.lock.material.opacity = 0.95 * lk.frac;
      this.padlock.position.set(spot.x + 0.035, ON_TABLE, spot.z - 0.09);
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
