/**
 * Escena Three.js — docs/02 §5.3 revisado por D-042 y docs/01 §11–12.
 * Orquestador: mapa (descriptor), cartas instanciadas, marionetas de los rivales,
 * tus manos, CameraRig y postproceso pixel. Presupuesto: ≤ 80 draw calls, 60 fps.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { CardValue, GameEvent, PlayerView, SlotView } from '@totem/core';
import {
  CAMERA,
  DECK_POSITION,
  DISCARD_POSITION,
  characterAnchors,
  seatAngle,
  slotPositions,
  type CameraPoseId,
  type Vec3,
} from './layout.js';
import { paletteFor } from './palette.js';
import { BACK_CELL, BLANK_CELL, cardAtlas } from './textures.js';
import { createPostFx, DEFAULT_PIXEL_HEIGHT, type PostFx } from './postfx.js';
import { CardSet, type CardHandle } from './cards.js';
import { Puppet } from './characters.js';
import { MyHands } from './my-hands.js';
import { buildMap, type BuiltMap } from './map-builder.js';
import { getMap, paletteForMap, type MapDescriptor } from './maps/index.js';
import { seatSpecies } from './species.js';
import type { SpeciesId } from '@totem/protocol';
import { gazeFor, gazeSubject, type GazeSubject } from './idle.js';
import { heldCardFace, poseForEvent, type PoseTarget } from './poses.js';
import {
  applyRig,
  initialRig,
  onDrag,
  onRelease,
  setPose,
  stepRig,
  togglePose,
  type RigState,
} from './camera-rig.js';
import { isTransformBusy, isTransformLocked } from './anim-lock.js';

export type Intent =
  | { kind: 'slot'; player: string; slot: number }
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'bell' };

export interface WorldOptions {
  colorBlind?: boolean;
  reducedMotion?: boolean;
  /** alto interno del render pixel (docs/05 §4.6); 0 = resolución nativa */
  pixelHeight?: number;
  mapId?: string;
}

export interface SeatLabel {
  id: string;
  /** px relativos al canvas */
  x: number;
  y: number;
  onScreen: boolean;
}

const DECK_STACK = 4;
/** Por debajo del temporizador de arriba al centro. */
const LABEL_MIN_Y_PX = 64;
const UP = new THREE.Vector3(0, 1, 0);

const slotKey = (pid: string, i: number): string => `slot:${pid}#${i}`;

function intentOf(key: string): Intent | null {
  if (key.startsWith('deck:')) return { kind: 'deck' };
  if (key === 'discard') return { kind: 'discard' };
  const m = /^slot:(.+)#(\d+)$/.exec(key);
  if (m?.[1] && m[2]) return { kind: 'slot', player: m[1], slot: Number(m[2]) };
  return null;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cards: CardSet;
  private readonly hands: MyHands;
  private readonly map: BuiltMap;
  private readonly mapDesc: MapDescriptor;
  private readonly puppets = new Map<string, Puppet>();
  private postfx?: PostFx;
  private rig: RigState = initialRig();
  private opts: Required<WorldOptions>;
  private seatOf = new Map<string, number>();
  private slotBase = new Map<string, string>();
  private players = 0;
  private youId = '';
  private seatInfo: Record<string, { avatar: number; species?: SpeciesId }> = {};
  private reveal?: { player: string; slot: number; value: number };
  private roundReveal?: Record<string, (CardValue | null)[]>;
  private ghostSeq = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private lastCalls = 0;
  private lastTriangles = 0;
  private t0 = 0;
  private lastNow = 0;
  private disposed = false;
  private lastView?: PlayerView;
  private gaze: GazeSubject = { kind: 'deck' };
  private readonly tmpV = new THREE.Vector3();
  /** desplazamiento que animan los VFX (temblor, elevarse en la revelación) */
  readonly cameraOffset = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: WorldOptions = {},
  ) {
    this.opts = {
      colorBlind: opts.colorBlind ?? false,
      reducedMotion: opts.reducedMotion ?? false,
      pixelHeight: opts.pixelHeight ?? DEFAULT_PIXEL_HEIGHT,
      mapId: opts.mapId ?? 'candle-night',
    };
    this.mapDesc = getMap(this.opts.mapId);
    const p = paletteFor(this.opts.colorBlind);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;

    this.scene.background = new THREE.Color(this.mapDesc.fondo.sky);
    const fog = this.mapDesc.fondo.fog;
    this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.map = buildMap(this.mapDesc);
    this.scene.add(this.map.root);
    this.map.bell.userData['intent'] = { kind: 'bell' } satisfies Intent;

    this.cards = new CardSet(cardAtlas(this.opts.colorBlind), p.mystic);
    this.scene.add(this.cards.root, this.cards.mesh, this.cards.frames);

    this.hands = new MyHands('owl');
    this.camera.add(this.hands.group);

    for (let i = 0; i < DECK_STACK; i++) {
      const h = this.cards.get(`deck:${i}`);
      h.proxy.position.set(DECK_POSITION.x, DECK_POSITION.y - 0.012 + i * 0.012, DECK_POSITION.z);
      h.proxy.rotation.y = (i % 2 ? 0.05 : -0.04) + Math.PI;
    }
    const d = this.cards.get('discard');
    d.proxy.position.set(DISCARD_POSITION.x, DISCARD_POSITION.y, DISCARD_POSITION.z);
    d.proxy.rotation.y = 0.12;

    try {
      this.postfx = createPostFx(this.renderer, this.scene, this.camera, {
        width: 640,
        height: 360,
        palette: paletteForMap(this.mapDesc, this.opts.colorBlind),
      });
    } catch {
      // Sin postproceso (WebGL limitado): la partida sigue siendo jugable.
      this.postfx = undefined;
    }
    this.resize();
  }

  // --- estado --------------------------------------------------------------

  /** Asientos del lobby → especie de cada personaje (la reservada, o el respaldo por avatar). */
  setSeats(seats: Record<string, { avatar: number; species?: SpeciesId }>): void {
    this.seatInfo = seats;
    this.lastView = undefined; // fuerza recolocar
  }

  setReveal(r: { player: string; slot: number; value: number } | undefined): void {
    this.reveal = r;
  }

  /** Revelación final (ROUND_REVEAL): valores públicos de todas las manos. */
  setRoundReveal(hands: Record<string, (CardValue | null)[]> | undefined): void {
    this.roundReveal = hands;
  }

  /** Reconstruye la mesa a partir de la vista filtrada del servidor. */
  update(view: PlayerView, _names: Record<string, string> = {}): void {
    const ids = [view.you.id, ...view.others.map((o) => o.id)];
    const total = Math.max(2, ids.length);
    const layoutChanged = total !== this.players || view.you.id !== this.youId || !this.lastView;
    this.youId = view.you.id;
    if (layoutChanged) this.relayout(ids, total);
    this.lastView = view;

    const seen = new Set<string>();
    const place = (pid: string, slots: SlotView[], seat: number): void => {
      const positions = slotPositions(slots.length, seat, total, { own: seat === 0 });
      const facing = -seatAngle(seat, total);
      slots.forEach((s, i) => {
        const key = slotKey(pid, i);
        seen.add(key);
        const pos = positions[i];
        if (!pos) return;
        const h = this.cards.get(key);
        this.placeSlot(h, pos, facing, s === 'empty');
        h.cell = this.slotCell(pid, i);
      });
    };
    place(view.you.id, view.you.slots, 0);
    view.others.forEach((o, k) => place(o.id, o.slots, k + 1));
    for (const key of this.cards.keys()) {
      if (key.startsWith('slot:') && !seen.has(key)) {
        this.cards.release(key);
        this.slotBase.delete(key);
      }
    }

    // Mazo y descarte.
    const stack = view.deckCount <= 0 ? 0 : Math.min(DECK_STACK, Math.ceil(view.deckCount / 10));
    for (let i = 0; i < DECK_STACK; i++) {
      const h = this.cards.find(`deck:${i}`);
      if (h) h.visible = i < stack;
    }
    const discard = this.cards.find('discard');
    if (discard) discard.cell = view.discardTop ?? BLANK_CELL;

    // Cartas en mano (I2/E22: la de un rival, siempre por el dorso).
    const holder = view.drawn ? view.activePlayer : undefined;
    for (const key of this.cards.keys()) {
      if (key.startsWith('held:') && key !== `held:${holder}`) this.cards.release(key);
    }
    this.hands.setHolding(holder === view.you.id, this.opts.reducedMotion);
    if (holder) {
      const face = heldCardFace({ owner: holder, you: view.you.id, drawn: view.drawn });
      const parent = holder === view.you.id ? this.hands.rightAnchor : undefined;
      const h = this.cards.get(`held:${holder}`, parent);
      h.cell = face === 'back' ? BACK_CELL : face;
    }
    for (const [pid, puppet] of this.puppets) puppet.ensureHolding(pid === holder);

    // Las marionetas miran a quien juega o al mazo (el punto se resuelve cada frame).
    const activeSeat = this.seatOf.get(view.activePlayer) ?? 0;
    this.gaze = gazeSubject({
      phase: view.phase,
      activePlayer: view.activePlayer,
      seatOf: this.seatOf,
    });
    this.map.layout(total, activeSeat);
  }

  private relayout(ids: string[], total: number): void {
    this.players = total;
    this.seatOf = new Map(ids.map((id, i) => [id, i]));
    this.slotBase.clear();
    const species = seatSpecies(ids.map((id) => this.seatInfo[id] ?? { avatar: 0 }));
    this.hands.setSpecies(species[0] ?? 'owl');
    for (const [pid, p] of this.puppets) {
      if (!ids.includes(pid) || pid === ids[0]) {
        p.dispose();
        this.puppets.delete(pid);
      }
    }
    ids.forEach((id, seat) => {
      if (seat === 0) return;
      const anchors = characterAnchors(seat, total);
      const want = species[seat] ?? 'owl';
      let p = this.puppets.get(id);
      if (p && p.species !== want) {
        p.dispose();
        p = undefined;
      }
      if (!p) {
        p = new Puppet(id, want, anchors);
        this.scene.add(p.root);
        this.puppets.set(id, p);
      }
      p.place(anchors);
    });
  }

  private placeSlot(h: CardHandle, pos: Vec3, facing: number, empty: boolean): void {
    const sig = `${pos.x.toFixed(4)},${pos.z.toFixed(4)},${facing.toFixed(3)}`;
    const moved = this.slotBase.get(h.key) !== sig;
    this.slotBase.set(h.key, sig);
    const proxy = h.proxy;
    if (moved || !isTransformLocked(proxy, 'position')) {
      if (moved || !isTransformBusy(proxy)) proxy.position.set(pos.x, pos.y, pos.z);
    }
    if (!isTransformLocked(proxy, 'rotation') && !isTransformBusy(proxy))
      proxy.rotation.set(0, facing, 0);
    proxy.userData['empty'] = empty;
    // E21: el hueco no se compacta; solo se apaga (salvo a mitad de animación).
    if (!isTransformBusy(proxy)) h.visible = !empty;
  }

  private slotCell(pid: string, i: number): number {
    const rr = this.roundReveal?.[pid]?.[i];
    if (rr !== undefined && rr !== null) return rr;
    const r = this.reveal;
    if (r && r.player === pid && r.slot === i) return r.value;
    return BACK_CELL;
  }

  private v(p: Vec3): THREE.Vector3 {
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  // --- personajes y eventos -------------------------------------------------

  /** El presenter llama aquí al EMPEZAR cada beat (docs/02 §5.2). */
  react(e: GameEvent): void {
    const reduced = this.opts.reducedMotion;
    if (e.e === 'ROUND_REVEAL') this.setRoundReveal(e.hands);
    if (e.e === 'ROUND_STARTED') this.setRoundReveal(undefined);
    for (const [pid, puppet] of this.puppets) {
      const cue = poseForEvent(e, pid);
      if (!cue) continue;
      puppet.play(
        cue,
        (t) => this.targetPoint(t),
        {
          onRelease: (from) => this.releaseCard(e, from),
        },
        reduced,
      );
    }
    if (!('player' in e) || e.player !== this.youId) return;
    switch (e.e) {
      case 'DREW':
        this.hands.play('draw', reduced);
        break;
      case 'DISCARDED_DRAWN':
      case 'SWAPPED_DRAWN': {
        const from = this.hands.rightAnchor.getWorldPosition(new THREE.Vector3());
        this.hands.play('release', reduced);
        this.releaseCard(e, from);
        break;
      }
      case 'MATCH_OK':
      case 'MATCH_FAIL':
        this.hands.play('slap', reduced);
        break;
      default:
        break;
    }
  }

  /** Carta que sale de una mano hacia el descarte (su valor ya es público). */
  private releaseCard(e: GameEvent, from: THREE.Vector3): void {
    if (e.e === 'DISCARDED_DRAWN') {
      this.flyCard(from, this.v(DISCARD_POSITION), e.value);
    } else if (e.e === 'SWAPPED_DRAWN') {
      const slot = this.cards.find(slotKey(e.player, e.slot));
      const start = slot ? slot.proxy.getWorldPosition(new THREE.Vector3()) : from;
      this.flyCard(start, this.v(DISCARD_POSITION), e.discardedValue);
    }
  }

  private targetPoint(t: PoseTarget): Vec3 | undefined {
    if (t.kind === 'deck') return DECK_POSITION;
    if (t.kind === 'discard') return DISCARD_POSITION;
    const h = this.cards.find(slotKey(t.player, t.slot));
    return h ? h.proxy.getWorldPosition(this.tmpV.clone()) : undefined;
  }

  /** Carta en vuelo en arco (pool de instancias «ghost»). */
  flyCard(from: THREE.Vector3, to: THREE.Vector3, cell: number, duration = 0.4): void {
    if (this.opts.reducedMotion) return;
    const key = `ghost:${this.ghostSeq++ % 8}`;
    this.cards.release(key);
    const h = this.cards.get(key);
    h.cell = cell;
    h.proxy.position.copy(from);
    const proxy = h.proxy;
    const arc = { k: 0 };
    gsap.to(arc, {
      k: 1,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => {
        proxy.position.lerpVectors(from, to, arc.k);
        proxy.position.y += Math.sin(arc.k * Math.PI) * 0.25;
        proxy.rotation.set(0, arc.k * Math.PI * 2, 0);
      },
      onComplete: () => this.cards.release(key),
    });
  }

  // --- acceso para VFX ------------------------------------------------------

  allTotems(): THREE.Object3D[] {
    return this.cards
      .keys()
      .filter((k) => k.startsWith('slot:'))
      .map((k) => this.cards.find(k))
      .filter((h): h is CardHandle => !!h && h.visible)
      .map((h) => h.proxy);
  }

  totemMesh(playerId: string, slot: number): THREE.Object3D | undefined {
    return this.cards.find(slotKey(playerId, slot))?.proxy;
  }
  pileMesh(kind: 'deck' | 'discard'): THREE.Object3D | undefined {
    return this.cards.find(kind === 'deck' ? `deck:${DECK_STACK - 1}` : 'discard')?.proxy;
  }
  object(name: string): THREE.Object3D | undefined {
    return this.scene.getObjectByName(name);
  }
  /** Medición real para el presupuesto de docs/02 §5.3 (≤ 80 draw calls, 60 fps). */
  get stats(): { drawCalls: number; triangles: number; fps: number; programs: number } {
    return {
      drawCalls: this.lastCalls,
      triangles: this.lastTriangles,
      fps: Math.round(this.fps),
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  // --- cámara ---------------------------------------------------------------

  get pose(): CameraPoseId {
    return this.rig.pose;
  }
  togglePose(): CameraPoseId {
    this.rig = togglePose(this.rig);
    return this.rig.pose;
  }
  setPose(p: CameraPoseId): void {
    this.rig = setPose(this.rig, p);
  }
  drag(dx: number, dy: number): CameraPoseId {
    this.rig = onDrag(this.rig, dx, dy, this.canvas.clientWidth || 960, this.opts.reducedMotion);
    return this.rig.pose;
  }
  release(): void {
    this.rig = onRelease(this.rig);
  }
  /** Giro con teclado (flechas): mismo límite que el arrastre. */
  nudgeYaw(dir: -1 | 1): void {
    const s = onDrag(onRelease(this.rig), -dir * 120, 0, 1000, this.opts.reducedMotion);
    this.rig = onRelease(s);
  }

  /** Posición en pantalla de la placa de cada rival (etiquetas 2D). */
  seatLabels(): SeatLabel[] {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const out: SeatLabel[] = [];
    for (const [pid, seat] of this.seatOf) {
      if (seat === 0) continue;
      const p = this.v(characterAnchors(seat, this.players).plate).project(this.camera);
      out.push({
        id: pid,
        x: ((p.x + 1) / 2) * w,
        // Si la cabeza se sale por arriba, la placa se queda pegada al borde.
        y: Math.max(LABEL_MIN_Y_PX, ((1 - p.y) / 2) * h),
        onScreen: p.z < 1 && Math.abs(p.x) < 0.95,
      });
    }
    return out;
  }

  // --- interacción ---------------------------------------------------------

  /** Raycaster: devuelve la intención bajo el puntero, o null. */
  pick(clientX: number, clientY: number): Intent | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.cards.mesh, this.map.bell], false);
    for (const hit of hits) {
      if (hit.object === this.map.bell) return { kind: 'bell' };
      if (hit.instanceId === undefined) continue;
      const h = this.cards.handleAt(hit.instanceId);
      if (!h || !h.visible || h.proxy.userData['empty'] === true) continue;
      const intent = intentOf(h.key);
      if (intent) return intent;
    }
    return null;
  }

  /** Resalta lo que es legal ahora mismo (docs/01 §11: solo lo legal brilla). */
  highlight(intents: Intent[], selected?: Intent): void {
    const key = (i: Intent): string =>
      i.kind === 'slot'
        ? slotKey(i.player, i.slot)
        : i.kind === 'deck'
          ? `deck:${DECK_STACK - 1}`
          : i.kind;
    const allowed = new Set(intents.map(key));
    if (selected) allowed.add(key(selected));
    for (const k of this.cards.keys()) {
      const h = this.cards.find(k);
      if (h) h.highlighted = allowed.has(k);
    }
    const bellOn = intents.some((i) => i.kind === 'bell');
    const mat = this.map.bell.material as THREE.MeshLambertMaterial;
    mat.emissive.setHex(bellOn ? paletteFor(this.opts.colorBlind).mystic : 0x000000);
    mat.emissiveIntensity = bellOn ? 0.6 : 0;
  }

  // --- bucle ---------------------------------------------------------------

  resize(): void {
    const w = this.canvas.clientWidth || 960;
    const h = this.canvas.clientHeight || 540;
    const px = this.opts.pixelHeight;
    const ih = px > 0 ? Math.min(px, h) : h;
    const iw = Math.max(1, Math.round((ih * w) / h));
    this.renderer.setSize(iw, ih, false);
    this.postfx?.setSize(iw, ih);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(nowMs: number): void {
    if (this.disposed) return;
    if (this.t0 === 0) this.t0 = nowMs;
    const dt = this.lastNow ? Math.min(100, nowMs - this.lastNow) : 16;
    this.lastNow = nowMs;
    const t = (nowMs - this.t0) / 1000;
    const reduced = this.opts.reducedMotion;
    const aspect = (this.canvas.clientWidth || 16) / (this.canvas.clientHeight || 9);

    this.rig = stepRig(this.rig, dt, reduced);
    applyRig(this.camera, this.rig, Math.max(2, this.players), aspect, t, reduced);
    this.camera.position.add(this.cameraOffset);
    this.map.update(t, reduced);
    this.aimPuppets();
    for (const p of this.puppets.values()) p.update(t, reduced);
    this.placeRivalHeldCards();

    this.scene.updateMatrixWorld();
    this.cards.sync(t);

    this.renderer.info.reset();
    if (this.postfx) this.postfx.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.lastCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;

    this.frames++;
    if (this.fpsWindowStart === 0) this.fpsWindowStart = nowMs;
    if (nowMs - this.fpsWindowStart >= 1000) {
      this.fps = (this.frames * 1000) / (nowMs - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = nowMs;
    }
  }

  /**
   * Punto que mira cada rival. Se recalcula cada frame para que, al girar la
   * cámara local, quien te mira siga tu mirada (D-045).
   */
  private aimPuppets(): void {
    for (const [pid, puppet] of this.puppets) {
      const subject = gazeFor(this.gaze, this.seatOf.get(pid) ?? 0);
      if (subject.kind === 'camera') puppet.lookAt(this.camera.position);
      else if (subject.kind === 'seat')
        puppet.lookAt(
          this.tmpV.set(0, 0, 0).add(this.v(characterAnchors(subject.seat, this.players).head)),
        );
      else puppet.lookAt(this.tmpV.set(DECK_POSITION.x, DECK_POSITION.y, DECK_POSITION.z));
    }
  }

  /** La carta de un rival sigue a su mano y te enseña el dorso (I2, E22). */
  private placeRivalHeldCards(): void {
    for (const [pid, puppet] of this.puppets) {
      const h = this.cards.find(`held:${pid}`);
      if (!h) continue;
      h.cell = BACK_CELL;
      h.visible = !puppet.holdingSuppressed;
      puppet.root.updateMatrixWorld(true);
      const pos = puppet.handWorld();
      h.proxy.position.copy(pos);
      const toCam = this.camera.position.clone().sub(pos).normalize();
      const z = UP.clone()
        .sub(toCam.clone().multiplyScalar(UP.dot(toCam)))
        .normalize();
      const x = new THREE.Vector3().crossVectors(toCam, z);
      h.proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, toCam, z));
      h.proxy.position.addScaledVector(z, 0.04);
    }
  }

  setOptions(opts: WorldOptions): void {
    const prevCb = this.opts.colorBlind;
    const prevPx = this.opts.pixelHeight;
    this.opts = { ...this.opts, ...opts };
    if (prevCb !== this.opts.colorBlind) {
      this.cards.setAtlas(cardAtlas(this.opts.colorBlind));
      this.postfx?.setPalette(paletteForMap(this.mapDesc, this.opts.colorBlind));
    }
    if (prevPx !== this.opts.pixelHeight) this.resize();
  }

  dispose(): void {
    this.disposed = true;
    for (const p of this.puppets.values()) p.dispose();
    this.puppets.clear();
    this.hands.dispose();
    this.cards.dispose();
    this.map.dispose();
    this.postfx?.dispose();
    this.renderer.dispose();
  }
}
