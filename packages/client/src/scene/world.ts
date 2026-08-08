/**
 * Escena Three.js — docs/02 §5.3 y docs/01 §11–12.
 * Cámara fija en primera persona, mesa redonda, tótems propios en arco inferior,
 * rivales alrededor. Presupuesto: 60 fps, ≤ 80 draw calls, sin assets externos.
 */
import * as THREE from 'three';
import type { PlayerView, SlotView } from '@totem/core';
import {
  BELL_POSITION,
  CAMERA,
  CANDLE_POSITION,
  DECK_POSITION,
  DISCARD_POSITION,
  TABLE_HEIGHT,
  TABLE_RADIUS,
  seatPosition,
  slotPositions,
  type Vec3,
} from './layout.js';
import { paletteFor } from './palette.js';
import { backTexture, faceTexture, toonGradient } from './textures.js';
import { createPostFx, type PostFx } from './postfx.js';

export type Intent =
  | { kind: 'slot'; player: string; slot: number }
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'bell' };

const TOTEM_W = 0.1;
const TOTEM_H = 0.14;

export interface WorldOptions {
  colorBlind?: boolean;
  reducedMotion?: boolean;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly interactive: THREE.Object3D[] = [];
  private readonly totems = new Map<string, THREE.Mesh>();
  private readonly plates = new Map<string, THREE.Sprite>();
  private readonly gradient = toonGradient();
  private candleLight!: THREE.PointLight;
  private postfx?: PostFx;
  private frames = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private seatOf = new Map<string, number>();
  private opts: Required<WorldOptions>;
  private t0 = 0;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: WorldOptions = {},
  ) {
    this.opts = {
      colorBlind: opts.colorBlind ?? false,
      reducedMotion: opts.reducedMotion ?? false,
    };
    const p = paletteFor(this.opts.colorBlind);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(p.bg);
    this.scene.fog = new THREE.Fog(p.bg, 3.2, 9);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.camera.position.set(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);
    this.camera.lookAt(CAMERA.lookAt.x, CAMERA.lookAt.y, CAMERA.lookAt.z);

    this.buildRoom();
    try {
      this.postfx = createPostFx(this.renderer, this.scene, this.camera, p, {
        width: canvas.clientWidth || 960,
        height: canvas.clientHeight || 540,
      });
    } catch {
      // Sin postproceso (WebGL limitado): la partida sigue siendo jugable.
      this.postfx = undefined;
    }
    this.resize();
  }

  // --- construcción --------------------------------------------------------

  private buildRoom(): void {
    const p = paletteFor(this.opts.colorBlind);
    const toon = (color: number): THREE.MeshToonMaterial =>
      new THREE.MeshToonMaterial({ color, gradientMap: this.gradient });

    // Mesa redonda de madera vieja.
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS * 0.94, 0.09, 40),
      toon(p.woodDark),
    );
    table.position.y = TABLE_HEIGHT - 0.045;
    this.scene.add(table);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_RADIUS, 0.035, 8, 44),
      toon(p.woodLight),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = TABLE_HEIGHT;
    this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 24), toon(0x140f1c));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Vela-reloj y campana de ÚLTIMA (HUD diegético, docs/01 §11).
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.16, 10),
      toon(p.ivory),
    );
    candle.name = 'candle';
    candle.position.set(CANDLE_POSITION.x, CANDLE_POSITION.y + 0.08, CANDLE_POSITION.z);
    this.scene.add(candle);

    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshBasicMaterial({ color: p.candle }),
    );
    flame.name = 'flame';
    flame.position.set(CANDLE_POSITION.x, CANDLE_POSITION.y + 0.18, CANDLE_POSITION.z);
    this.scene.add(flame);

    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.13, 12), toon(0xc9a227));
    bell.name = 'bell';
    bell.userData['intent'] = { kind: 'bell' } satisfies Intent;
    bell.position.set(BELL_POSITION.x, BELL_POSITION.y + 0.06, BELL_POSITION.z);
    this.scene.add(bell);
    this.interactive.push(bell);

    // Mazo y descarte.
    const deck = this.makePile(DECK_POSITION, 'deck');
    const discard = this.makePile(DISCARD_POSITION, 'discard');
    this.interactive.push(deck, discard);

    // Luces: 1 direccional cálida + ambiente tenue + punto de vela con flicker.
    const key = new THREE.DirectionalLight(0xffd9a0, 1.1);
    key.position.set(1.4, 2.6, -1.2);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x3a3350, 0.55));
    this.candleLight = new THREE.PointLight(p.candle, 2.2, 3.4, 2);
    this.candleLight.position.set(CANDLE_POSITION.x, CANDLE_POSITION.y + 0.2, CANDLE_POSITION.z);
    this.scene.add(this.candleLight);
  }

  private makePile(pos: Vec3, kind: 'deck' | 'discard'): THREE.Mesh {
    const mat =
      kind === 'deck'
        ? new THREE.MeshToonMaterial({ map: backTexture(), gradientMap: this.gradient })
        : new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: this.gradient });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(TOTEM_W, 0.02, TOTEM_H), mat);
    mesh.name = kind;
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData['intent'] = { kind } satisfies Intent;
    this.scene.add(mesh);
    return mesh;
  }

  // --- estado --------------------------------------------------------------

  /** Reconstruye los tótems a partir de la vista filtrada del servidor. */
  update(view: PlayerView, names: Record<string, string> = {}): void {
    const ids = [view.you.id, ...view.others.map((o) => o.id)];
    const total = Math.max(2, ids.length);
    this.seatOf = new Map(ids.map((id, i) => [id, i]));

    const seen = new Set<string>();
    const place = (playerId: string, slots: SlotView[], own: boolean): void => {
      const seat = this.seatOf.get(playerId) ?? 0;
      const positions = slotPositions(slots.length, seat, total, { own });
      slots.forEach((s, i) => {
        const key = `${playerId}#${i}`;
        seen.add(key);
        const pos = positions[i];
        if (!pos) return;
        let mesh = this.totems.get(key);
        if (!mesh) {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(TOTEM_W, 0.016, TOTEM_H),
            new THREE.MeshToonMaterial({ map: backTexture(), gradientMap: this.gradient }),
          );
          mesh.userData['intent'] = { kind: 'slot', player: playerId, slot: i } satisfies Intent;
          this.scene.add(mesh);
          this.interactive.push(mesh);
          this.totems.set(key, mesh);
        }
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.rotation.y = own ? 0 : Math.PI;
        // E21: los huecos NO se compactan: el slot sigue existiendo, solo se apaga.
        mesh.visible = s === 'hidden';
        mesh.userData['empty'] = s === 'empty';
      });
      this.setPlate(playerId, names[playerId] ?? playerId, seat, total, own);
    };

    place(view.you.id, view.you.slots, true);
    for (const o of view.others) place(o.id, o.slots, false);

    for (const [key, mesh] of this.totems) {
      if (seen.has(key)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.totems.delete(key);
    }

    // Descarte: cara visible con su valor.
    const discard = this.scene.getObjectByName('discard') as THREE.Mesh | undefined;
    if (discard) {
      const mat = discard.material as THREE.MeshToonMaterial;
      mat.map =
        view.discardTop === undefined
          ? backTexture()
          : faceTexture(view.discardTop, this.opts.colorBlind);
      mat.needsUpdate = true;
    }
    const deck = this.scene.getObjectByName('deck') as THREE.Mesh | undefined;
    if (deck) deck.visible = view.deckCount > 0;
  }

  /** Placa de nombre billboard sobre cada asiento. */
  private setPlate(
    playerId: string,
    label: string,
    seat: number,
    total: number,
    own: boolean,
  ): void {
    if (own) return;
    let sprite = this.plates.get(playerId);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.fillStyle = 'rgba(27,23,37,0.8)';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#f2e8d5';
    c.font = 'bold 30px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label.slice(0, 14), 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(0.34, 0.085, 1);
      this.scene.add(sprite);
      this.plates.set(playerId, sprite);
    } else {
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).map = tex;
    }
    const p = seatPosition(seat, total, 1.72);
    sprite.position.set(p.x, TABLE_HEIGHT + 0.22, p.z);
  }

  allTotems(): THREE.Mesh[] {
    return [...this.totems.values()].filter((m) => m.visible);
  }

  totemMesh(playerId: string, slot: number): THREE.Mesh | undefined {
    return this.totems.get(`${playerId}#${slot}`);
  }
  pileMesh(kind: 'deck' | 'discard'): THREE.Mesh | undefined {
    return this.scene.getObjectByName(kind) as THREE.Mesh | undefined;
  }
  object(name: string): THREE.Object3D | undefined {
    return this.scene.getObjectByName(name);
  }
  /** Medición real para el presupuesto de docs/02 §5.3 (≤ 80 draw calls, 60 fps). */
  get stats(): { drawCalls: number; triangles: number; fps: number; programs: number } {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      fps: Math.round(this.fps),
      programs: info.programs?.length ?? 0,
    };
  }

  // --- interacción ---------------------------------------------------------

  /** Raycaster: devuelve la intención bajo el puntero, o null. */
  pick(clientX: number, clientY: number): Intent | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactive, false);
    for (const h of hits) {
      if (h.object.userData['empty'] === true) continue;
      const intent = h.object.userData['intent'] as Intent | undefined;
      if (intent) return intent;
    }
    return null;
  }

  /**
   * Resalta lo que es legal ahora mismo (docs/01 §11: solo lo legal brilla).
   * Usa OutlinePass; si el postproceso no está disponible, cae a `emissive`.
   */
  highlight(intents: Intent[]): void {
    const key = (i: Intent): string => (i.kind === 'slot' ? `slot:${i.player}:${i.slot}` : i.kind);
    const allowed = new Set(intents.map(key));
    const selected: THREE.Object3D[] = [];
    for (const obj of this.interactive) {
      const intent = obj.userData['intent'] as Intent | undefined;
      if (!intent) continue;
      const on = allowed.has(key(intent)) && obj.visible && obj.userData['empty'] !== true;
      if (on) selected.push(obj);
      if (this.postfx) continue;
      const mat = (obj as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
      if (!mat || !('emissive' in mat)) continue;
      mat.emissive?.setHex(on ? paletteFor(this.opts.colorBlind).mystic : 0x000000);
      mat.emissiveIntensity = on ? 0.55 : 0;
    }
    if (this.postfx) this.postfx.outline.selectedObjects = selected;
  }

  // --- bucle ---------------------------------------------------------------

  resize(): void {
    const w = this.canvas.clientWidth || 960;
    const h = this.canvas.clientHeight || 540;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  }

  render(nowMs: number): void {
    if (this.disposed) return;
    if (this.t0 === 0) this.t0 = nowMs;
    const t = (nowMs - this.t0) / 1000;
    if (!this.opts.reducedMotion) {
      // Oscilación idle de «respiración» (docs/01 §11).
      this.camera.position.y =
        CAMERA.position.y + Math.sin(t * CAMERA.idleSpeedHz * Math.PI * 2) * CAMERA.idleAmplitude;
      this.camera.position.x =
        CAMERA.position.x + Math.sin(t * 0.11 * Math.PI * 2) * CAMERA.idleAmplitude * 0.6;
      this.camera.lookAt(CAMERA.lookAt.x, CAMERA.lookAt.y, CAMERA.lookAt.z);
      // Flicker de vela.
      this.candleLight.intensity = 2.0 + Math.sin(t * 11) * 0.18 + Math.sin(t * 4.3) * 0.12;
    }
    if (this.postfx) {
      this.postfx.update(t);
      this.postfx.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // fps medido sobre ventanas de 1 s.
    this.frames++;
    if (this.fpsWindowStart === 0) this.fpsWindowStart = nowMs;
    if (nowMs - this.fpsWindowStart >= 1000) {
      this.fps = (this.frames * 1000) / (nowMs - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = nowMs;
    }
  }

  setOptions(opts: WorldOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  dispose(): void {
    this.disposed = true;
    this.postfx?.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  }
}
