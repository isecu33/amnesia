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
const SPENT = 0x3a1a1a;
const DIMMED = 0x4a3a2a;
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
  private readonly marks: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly wave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly digits: ReturnType<typeof carving>[] = [];
  private readonly letters = new Map<string, ReturnType<typeof carving>>();
  private slotSpots: THREE.Vector3[] = [];
  private tinted: number | undefined;
  private readonly bellLight = new THREE.PointLight(ULTIMA, 0, 1.2, 1.4);

  constructor(
    private readonly bell: THREE.Object3D | undefined,
    private readonly discard: THREE.Object3D | undefined,
    private readonly cards: THREE.InstancedMesh | undefined,
    private readonly slotProxy: (slot: number) => THREE.Object3D | undefined,
  ) {
    // Sin color por instancia three pinta negro: se inicializan todas en blanco.
    if (cards) for (let i = 0; i < cards.count; i++) cards.setColorAt(i, new THREE.Color(1, 1, 1));
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
    // Turnos restantes de ¡ÚLTIMA!: tres arcos grabados en el suelo delante de la campana.
    for (let i = 0; i < 3; i++) {
      const centre = Math.PI / 2 + (i - 1) * 0.75;
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.17, 12, 1, centre - 0.25, 0.5),
        new THREE.MeshBasicMaterial({ color: ULTIMA, transparent: true, depthWrite: false, fog: false }),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(BELL_POSITION.x, ON_TABLE, BELL_POSITION.z);
      this.marks.push(arc);
      this.root.add(arc);
    }
    this.wave = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 32),
      new THREE.MeshBasicMaterial({ color: ULTIMA, transparent: true, depthWrite: false, fog: false }),
    );
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.set(BELL_POSITION.x, ON_TABLE, BELL_POSITION.z);
    this.root.add(this.wave);
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
    this.bellLight.position.set(BELL_POSITION.x, TABLE_HEIGHT + 0.3, BELL_POSITION.z);
    this.root.add(this.bellLight);
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
    if (this.discard) this.discard.position.y = DISCARD_POSITION.y + (f !== undefined ? 0.03 : 0);
    if (f === undefined) return;
    this.stealRing.scale.setScalar(0.4 + f * 1.6);
    this.stealRing.material.opacity = 0.85;
  }

  private layoutBell(s: ImmersiveState, t: number): void {
    const u = s.ultima;
    this.marks.forEach((m, i) => {
      m.visible = !!u;
      m.material.color.setHex(u && i < u.turnsLeft ? ULTIMA : SPENT);
    });
    // Una onda lenta sale de la campana mientras dura la ¡ÚLTIMA!; sin parpadeos.
    this.wave.visible = !!u;
    if (u) {
      const k = (t % 2.4) / 2.4;
      this.wave.scale.setScalar(0.1 + k * 0.28);
      this.wave.material.opacity = 0.7 * (1 - k);
    }
    this.bellLight.intensity = u ? 2 : 0;
    if (!this.bell) return;
    this.bell.rotation.z = u ? Math.sin(t * 16) * 0.3 * (0.6 + 0.4 * Math.abs(Math.sin(t * 1.5))) : 0;
    const mat = (this.bell as THREE.Mesh).material as THREE.MeshLambertMaterial;
    mat.emissive?.setRGB(u ? 0.2 + 0.15 * Math.sin(t * 3) : 0, 0, 0);
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
      d.material.color.setHex(locked ? DIMMED : s.slotsLegal ? FLAME : CARVE);
    });
    for (const [k, l] of this.letters) {
      const lit = s.keys.includes(k);
      // Sin parpadeos: la tecla grabada solo se aviva en tono cálido; el robo lo cuenta el aro.
      l.visible = k !== 'E';
      l.material.color.setHex(lit ? FLAME : CARVE);
    }
    this.tintCard(s.locked);
  }

  /** La carta bloqueada se oscurece (color por instancia) y recupera la luz con el castigo. */
  private tintCard(lk: ImmersiveState['locked']): void {
    const mesh = this.cards;
    if (!mesh?.instanceColor) return;
    const proxy = lk ? this.slotProxy(lk.slot) : undefined;
    if (this.tinted !== undefined) {
      mesh.setColorAt(this.tinted, new THREE.Color(1, 1, 1));
      this.tinted = undefined;
    }
    if (lk && proxy) {
      const at = proxy.getWorldPosition(new THREE.Vector3());
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        if (p.setFromMatrixPosition(m).distanceToSquared(at) < 1e-6) {
          const v = 1 - 0.85 * lk.frac;
          mesh.setColorAt(i, new THREE.Color(v, v, v));
          this.tinted = i;
          break;
        }
      }
    }
    mesh.instanceColor.needsUpdate = true;
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
