/**
 * Secuencias VFX — docs/03 WP-11, duraciones de docs/01 §11.
 * Cada secuencia sigue anticipación → acción → impacto → reposo, y comunica QUÉ
 * pasó con color de la paleta (místico = acierto/efecto, peligro = castigo, vela
 * = ¡ÚLTIMA!/vislumbre). Nunca varían según el valor de una carta oculta (I2).
 *
 * «Menos movimiento» (D-015): sin partículas, sacudidas ni movimiento de mallas;
 * solo una viñeta teñida lenta como pista visual (D-065).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import { DEFAULT_CONFIG, type GameEvent } from '@totem/core';
import { EFFECT_COLORS } from '../presenter/effects.js';
import * as fx from './effect-fx.js';
import { reducedCueFor } from './reduced-cues.js';
import { DURATIONS, type VfxId } from '../presenter/timelines.js';
import { paletteFor, type Palette } from '../scene/palette.js';
import { DECK_POSITION, DISCARD_POSITION, TABLE_HEIGHT } from '../scene/layout.js';
import { shakeOffset } from '../scene/camera-rig.js';
import type { World } from '../scene/world.js';
import {
  ParticlePool,
  burstSpecs,
  disposeObject,
  makeChain,
  makeCrow,
  makeGlow,
  makeShockwave,
  type BurstOptions,
} from './particles.js';
import { ScreenFx } from './screen.js';

export type SequenceId = VfxId;

export interface VfxContext {
  world: World;
  colorBlind: boolean;
  reducedMotion: boolean;
  /** identificador del jugador local (impactos propios pesan más) */
  youId: string;
  /** `stealWindowMs` de la sala (ventana de robo); por defecto el de core */
  stealWindowMs?: number;
}

/** Capacidad de los pools (1 draw call cada uno). */
const ADD_CAPACITY = 640;
const SOFT_CAPACITY = 320;
/** Máximo de slots por jugador (docs/01 §9: 8) para buscar los tótems del cantor. */
const MAX_SLOTS_SCAN = 8;
/** Momento del golpe de la carta en el descarte (vuelo de `World.flyCard`). */
const DISCARD_IMPACT_S = 0.38;
/** Altura del tablero donde nacen ondas y polvo. */
const TABLE_Y = TABLE_HEIGHT + 0.012;
const NIGHT = 0x1b1725;

const s = (ms: number): number => ms / 1000;
const v3 = (p: { x: number; y: number; z: number }): THREE.Vector3 =>
  new THREE.Vector3(p.x, p.y, p.z);

export class Vfx {
  private readonly add = new ParticlePool(ADD_CAPACITY, true);
  private readonly soft = new ParticlePool(SOFT_CAPACITY, false);
  readonly screen: ScreenFx;
  /** Inclinación de cámara animada por secuencias; la sacudida se suma encima. */
  private readonly lean = new THREE.Vector3();
  private readonly temps: THREE.Object3D[] = [];
  private readonly timelines: gsap.core.Animation[] = [];
  private timeSec = 0;

  constructor(private ctx: VfxContext) {
    ctx.world.scene.add(this.soft.points, this.add.points);
    this.screen = new ScreenFx(ctx.reducedMotion);
  }

  setContext(ctx: Partial<VfxContext>): void {
    this.ctx = { ...this.ctx, ...ctx };
    this.screen.setReduced(this.ctx.reducedMotion);
  }

  private get p(): Palette {
    return paletteFor(this.ctx.colorBlind);
  }

  /** Punto de entrada del presenter. */
  play(id: SequenceId, e: GameEvent): void {
    if (this.ctx.reducedMotion) return this.reducedCue(id, e);
    switch (id) {
      case 'drawDeck':
      case 'drawDiscard':
        return this.draw(id === 'drawDeck');
      case 'discard':
        return this.discard(e);
      case 'swap':
        return this.swap(e);
      case 'peek':
        return this.peek(e);
      case 'spy':
        return this.spy(e);
      case 'blindSwap':
        return this.blindSwap(e);
      case 'matchOk':
        return this.matchOk(e);
      case 'matchFail':
        return this.matchFail(e);
      case 'ultima':
        return this.ultima(e);
      case 'reveal':
        return this.reveal();
      case 'penalty':
        return this.penalty(e);
      case 'reject':
        return this.reject();
      case 'chain':
        return this.chain(e);
      case 'steal':
        return this.steal();
      case 'shuffle':
        return this.shuffle();
      case 'victory':
        return this.victory();
      // P1 efectos (vfx/effect-fx.ts)
      case 'peekMark':
        return fx.peekMark(this.kit, e);
      case 'spyMark':
        return fx.spyMark(this.kit, e);
      case 'sharedEye':
        return fx.sharedEye(this.kit, e);
      case 'rumble':
        return fx.rumble(this.kit, e);
      case 'seerLook':
        return fx.seerLook(this.kit, e);
      case 'seerSwap':
        return this.blindSwap(e, EFFECT_COLORS.SEER);
      case 'stealOpen':
        return fx.stealOpen(this.kit, e, this.ctx.stealWindowMs ?? DEFAULT_CONFIG.stealWindowMs);
      case 'chainBroken':
        return fx.chainBroken(this.kit);
      case 'omen':
        return fx.omen(this.kit, e);
      case 'doubleDraw':
        return fx.doubleDraw(this.kit, e);
      case 'doubleDrawClear':
        return fx.doubleDrawClear(this.kit, e);
      case 'doubleDrew':
        return fx.doubleDrew(this.kit);
      case 'doubleDrawReject':
        return fx.doubleDrawReject(this.kit);
      case 'wildGift':
        return fx.wildGift(this.kit, e);
      case 'fizzle':
        return fx.fizzle(this.kit);
    }
  }

  /** Piezas reutilizables para las secuencias de vfx/effect-fx.ts. */
  private get kit(): fx.FxKit {
    return {
      world: this.ctx.world,
      youId: this.ctx.youId,
      p: this.p,
      add: this.add,
      soft: this.soft,
      screen: this.screen,
      emit: (pool, at, o) => this.emit(pool, at, o),
      ring: (at, c, size, dur) => this.ring(at, c, size, dur),
      glowAt: (at, c, size, hold, flicker) => this.glowAt(at, c, size, hold, flicker),
      puff: (at, c) => this.puff(at, c),
      stream: (at, d, per, o) => this.stream(at, d, per, o),
      slam: (at, c, trauma, ring) => this.slam(at, c, trauma, ring),
      at: (d, f) => this.at(d, f),
      track: (a) => this.track(a),
      temp: (o) => this.temp(o),
      kill: (o) => this.kill(o),
      claim: (o) => this.claim(o),
    };
  }

  /**
   * Sin movimiento: una viñeta teñida que dice «qué tipo de cosa pasó» y, si un
   * efecto tocó casillas, un halo quieto sobre ellas (solo opacidad).
   */
  private reducedCue(id: SequenceId, e: GameEvent): void {
    const c = reducedCueFor(id, e, this.p);
    if (c) this.screen.tintPulse(c.color, c.strength, c.holdMs, c.fadeMs);
    if (e.e === 'EFFECT_RESOLVED' && c)
      for (const r of e.publicInfo.slots) {
        const m = this.ctx.world.totemMesh(r.player, r.slot);
        if (m) this.staticMark(m.position.clone().setY(m.position.y + 0.06), c.color);
      }
  }

  /** Halo que solo aparece y se apaga (sin escala ni desplazamiento): «menos movimiento». */
  private staticMark(at: THREE.Vector3, color: number): void {
    const g = this.temp(makeGlow(color, 0.24));
    g.position.copy(at);
    const mat = g.material as THREE.SpriteMaterial;
    this.track(
      gsap
        .timeline({ onComplete: () => this.kill(g) })
        .fromTo(mat, { opacity: 0 }, { opacity: 1, duration: 0.25 })
        .to(mat, { opacity: 0, duration: 0.4 }, fx.SLOT_MARK_S),
    );
  }

  // --- secuencias -------------------------------------------------------------

  /** Robar: el montón cede un poco y suelta polvo de cartón. */
  private draw(fromDeck: boolean): void {
    const pile = this.ctx.world.pileMesh(fromDeck ? 'deck' : 'discard');
    if (!pile) return;
    const at = pile.getWorldPosition(new THREE.Vector3());
    this.hop(pile, -0.006, 0.08);
    this.emit(this.soft, at, {
      count: 12,
      color0: this.p.ivory,
      color1: NIGHT,
      size: 0.022,
      speed: 0.35,
      lifeMs: 450,
      gravity: -0.4,
      radius: 0.03,
    });
    this.emit(this.add, at, {
      count: 5,
      color0: this.p.candle,
      size: 0.015,
      speed: 0.5,
      lifeMs: 350,
      spread: 0.4,
    });
  }

  /** Descartar: la carta cae (vuelo de World) y aquí está el golpe seco. */
  private discard(e: GameEvent): void {
    if (e.e !== 'DISCARDED_DRAWN') return;
    const own = e.player === this.ctx.youId;
    this.at(DISCARD_IMPACT_S, () => {
      const pile = this.ctx.world.pileMesh('discard');
      if (pile) this.hop(pile, -0.008, 0.06);
      this.slam(v3(DISCARD_POSITION), this.p.ivory, own ? 0.22 : 0.12, 0.22);
      // Carta con efecto (dato público del evento): remolino místico.
      if (e.effect) {
        this.glowAt(v3(DISCARD_POSITION).setY(TABLE_Y + 0.05), this.p.mystic, 0.35, 0.7);
        this.emit(this.add, v3(DISCARD_POSITION), {
          count: 26,
          color0: this.p.mystic,
          color1: NIGHT,
          size: 0.02,
          speed: 0.6,
          lifeMs: 800,
          gravity: 0.3,
          spread: 0.5,
          radius: 0.05,
        });
      }
    });
  }

  /** Sustituir: amago, el tótem se alza girando y aterriza con polvo. */
  private swap(e: GameEvent): void {
    if (e.e !== 'SWAPPED_DRAWN') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    if (!mesh) return;
    const d = s(DURATIONS.swap);
    const y0 = mesh.position.y;
    const r0 = mesh.rotation.y;
    this.claim(mesh);
    this.track(
      gsap
        .timeline({ onComplete: () => this.slam(mesh.position.clone(), this.p.ivory, 0.08, 0.14) })
        .to(mesh.position, { y: y0 - 0.01, duration: d * 0.12, ease: 'power1.in' })
        .to(mesh.position, { y: y0 + 0.17, duration: d * 0.4, ease: 'power3.out' })
        .to(mesh.position, { y: y0, duration: d * 0.38, ease: 'power2.in' })
        .to(
          mesh.rotation,
          { y: r0 + Math.PI * 2, duration: d * 0.78, ease: 'power2.inOut' },
          d * 0.12,
        )
        .to(mesh.scale, { y: 0.8, x: 1.12, duration: 0.05, yoyo: true, repeat: 1 }),
    );
    this.trail(mesh, this.p.ivory, d * 0.9, 40);
  }

  /** Vislumbre: tu tótem se alza 15° hacia ti con halo de vela y ascuas. */
  private peek(e: GameEvent): void {
    if (e.e !== 'PRIVATE_REVEAL') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    if (!mesh) return;
    const p = this.p;
    const ttl = s(e.ttlMs);
    const y0 = mesh.position.y;
    const x0 = mesh.rotation.x;
    this.claim(mesh);
    this.track(
      gsap
        .timeline()
        .to(mesh.position, { y: y0 - 0.006, duration: 0.07 })
        .to(mesh.rotation, {
          x: x0 - THREE.MathUtils.degToRad(15),
          duration: 0.3,
          ease: 'back.out(2)',
        })
        .to(mesh.position, { y: y0 + 0.05, duration: 0.3, ease: 'back.out(2)' }, '<')
        .to(mesh.rotation, { x: x0, duration: 0.3, ease: 'power2.in' }, ttl - 0.3)
        .to(mesh.position, { y: y0, duration: 0.3, ease: 'power2.in' }, ttl - 0.3),
    );
    const at = mesh.position.clone().setY(y0 + 0.05);
    this.glowAt(at, p.candle, 0.32, ttl, 0.1);
    this.ring(at.clone().setY(TABLE_Y), p.candle, 0.18, 0.5);
    this.stream(at, ttl - 0.3, 14, {
      count: 1,
      color0: p.candle,
      color1: NIGHT,
      size: 0.016,
      speed: 0.12,
      lifeMs: 900,
      gravity: 0.25,
      radius: 0.05,
    });
  }

  /** Espionaje: un cuervo espectral vuela en arco al tótem rival y vuelve. */
  private spy(e: GameEvent): void {
    if (e.e !== 'PRIVATE_REVEAL') return;
    const target = this.ctx.world.totemMesh(e.player, e.slot);
    if (!target) return;
    const p = this.p;
    const ttl = s(e.ttlMs);
    const from = v3(DISCARD_POSITION).setY(DISCARD_POSITION.y + 0.1);
    const to = target.position.clone().setY(target.position.y + 0.12);
    const ctrl = from
      .clone()
      .lerp(to, 0.5)
      .setY(Math.max(from.y, to.y) + 0.35);
    const crow = this.temp(makeCrow(p.mystic));
    crow.position.copy(from);
    const wings = crow.children.filter((c) => c.name.startsWith('wing')).map((w) => w.rotation);
    const flap = this.track(
      gsap.fromTo(wings, { x: -0.7 }, { x: 0.7, duration: 0.11, yoyo: true, repeat: -1 }),
    );
    const fly = (
      a: THREE.Vector3,
      c: THREE.Vector3,
      b: THREE.Vector3,
      dur: number,
      delay: number,
    ) => {
      const k = { t: 0 };
      const prev = a.clone();
      return gsap.to(k, {
        t: 1,
        duration: dur,
        delay,
        ease: 'power1.inOut',
        onUpdate: () => {
          const t = k.t;
          const q = new THREE.Vector3()
            .copy(a)
            .multiplyScalar((1 - t) * (1 - t))
            .addScaledVector(c, 2 * (1 - t) * t)
            .addScaledVector(b, t * t);
          crow.position.copy(q);
          if (q.distanceToSquared(prev) > 1e-8) crow.lookAt(q.clone().add(q.clone().sub(prev)));
          crow.rotateY(-Math.PI / 2);
          prev.copy(q);
          this.add.spawn({
            pos: q.clone(),
            vel: new THREE.Vector3(0, 0.05, 0),
            lifeMs: 500,
            size0: 0.018,
            size1: 0.004,
            color0: p.mystic,
            color1: NIGHT,
            gravity: 0,
            drag: 2,
          });
        },
      });
    };
    const out = ttl * 0.25;
    this.track(fly(from, ctrl, to, out, 0));
    this.track(fly(to, ctrl, from, out, ttl - out));
    this.at(ttl, () => {
      flap.kill();
      this.kill(crow);
    });
    this.at(out, () => {
      this.ring(to.clone().setY(TABLE_Y), p.mystic, 0.2, 0.6);
      this.glowAt(to, p.mystic, 0.3, ttl - out * 2, 0.15);
      this.screen.tintPulse(p.mystic, 0.4, Math.max(0, (ttl - out * 2) * 1000), 500);
    });
    // Leve lean de la cámara hacia el objetivo (docs/02 §5.3).
    const cam = this.ctx.world.camera;
    this.track(
      gsap.to(this.lean, {
        x: (target.position.x - cam.position.x) * 0.06,
        duration: ttl * 0.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
      }),
    );
  }

  /** Trueque Ciego: dos zarcillos de humo se cruzan y los tótems giran (Vidente: púrpura). */
  private blindSwap(e: GameEvent, smoke: number = EFFECT_COLORS.SWAP): void {
    if (e.e !== 'EFFECT_RESOLVED' || e.publicInfo.slots.length < 2) return;
    const [a, b] = e.publicInfo.slots;
    const ma = a ? this.ctx.world.totemMesh(a.player, a.slot) : undefined;
    const mb = b ? this.ctx.world.totemMesh(b.player, b.slot) : undefined;
    if (!ma || !mb) return;
    const d = s(DURATIONS.blindSwap);
    const pa = ma.position.clone();
    const pb = mb.position.clone();
    for (const [m, at] of [
      [ma, pa],
      [mb, pb],
    ] as const) {
      this.puff(at, smoke);
      this.claim(m);
      this.track(
        gsap
          .timeline()
          .to(m.position, { y: at.y + 0.06, duration: d * 0.25, ease: 'power2.out' })
          .to(m.rotation, { y: m.rotation.y + Math.PI, duration: d * 0.6, ease: 'power2.inOut' }, 0)
          .to(m.position, { y: at.y, duration: d * 0.3, ease: 'bounce.out' }, d * 0.6),
      );
    }
    const k = { t: 0 };
    let acc = 0;
    this.track(
      gsap.to(k, {
        t: 1,
        duration: d * 0.85,
        ease: 'none',
        onUpdate: () => {
          acc += 1;
          if (acc % 2) return;
          for (const [from, to, side] of [
            [pa, pb, 1],
            [pb, pa, -1],
          ] as const) {
            const q = from.clone().lerp(to, k.t);
            q.y += Math.sin(k.t * Math.PI) * 0.22;
            q.x += Math.sin(k.t * Math.PI * 3) * 0.04 * side;
            this.soft.spawn({
              pos: q,
              vel: new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                0.06,
                (Math.random() - 0.5) * 0.1,
              ),
              lifeMs: 650,
              size0: 0.03,
              size1: 0.055,
              color0: smoke,
              color1: NIGHT,
              gravity: 0.05,
              drag: 1,
            });
          }
        },
        onComplete: () => {
          this.puff(pa, smoke);
          this.puff(pb, smoke);
        },
      }),
    );
  }

  /** Acierto: el tótem coge impulso, salta en arco al descarte y estalla. */
  private matchOk(e: GameEvent): void {
    if (e.e !== 'MATCH_OK') return;
    const mesh = this.ctx.world.totemMesh(e.owner ?? e.player, e.slot);
    const p = this.p;
    const d = s(DURATIONS.matchOk);
    const own = e.player === this.ctx.youId;
    const impact = (): void => {
      const at = v3(DISCARD_POSITION);
      this.slam(at, p.mystic, own ? 0.3 : 0.18, 0.3);
      this.emit(this.add, at, {
        count: 42,
        color0: 0xffffff,
        color1: p.mystic,
        size: 0.024,
        speed: 1.3,
        lifeMs: 650,
        gravity: -2.2,
      });
      this.glowAt(at.clone().setY(TABLE_Y + 0.04), p.mystic, 0.4, 0.35);
      this.screen.impact({ color: p.mystic, flash: own ? 0.2 : 0.1 });
    };
    if (!mesh) {
      this.at(d * 0.7, impact);
      return;
    }
    const from = mesh.position.clone();
    const to = v3(DISCARD_POSITION).setY(DISCARD_POSITION.y + 0.03);
    const k = { t: 0 };
    this.claim(mesh);
    this.track(
      gsap
        .timeline({ onComplete: impact })
        .to(mesh.position, { y: from.y + 0.07, duration: d * 0.2, ease: 'power2.out' })
        .to(mesh.scale, { x: 1.15, y: 1.15, z: 1.15, duration: d * 0.2 }, 0)
        .to(k, {
          t: 1,
          duration: d * 0.5,
          ease: 'power2.in',
          onUpdate: () => {
            mesh.position.lerpVectors(from, to, k.t);
            mesh.position.y += 0.07 * (1 - k.t) + Math.sin(k.t * Math.PI) * 0.12;
          },
        })
        .to(mesh.scale, { x: 1, y: 1, z: 1, duration: d * 0.5 }, '<')
        .to(mesh.rotation, { y: mesh.rotation.y + Math.PI * 2, duration: d * 0.5 }, '<'),
    );
    this.trail(mesh, p.mystic, d * 0.7, 60);
  }

  /** Fallo: temblor, destello rojo, viñeta de castigo mientras todos lo ven. */
  private matchFail(e: GameEvent): void {
    if (e.e !== 'MATCH_FAIL') return;
    const mesh = this.ctx.world.totemMesh(e.owner ?? e.player, e.slot);
    const p = this.p;
    const showMs = e.revealMs ?? DURATIONS.matchFail;
    const own = e.player === this.ctx.youId;
    this.screen.impact({ color: p.danger, flash: own ? 0.28 : 0.14, trauma: own ? 0.5 : 0.25 });
    this.screen.tintPulse(p.danger, own ? 0.5 : 0.3, Math.max(0, showMs - 900), 700);
    if (!mesh) return;
    const x0 = mesh.position.x;
    this.claim(mesh);
    this.track(
      gsap
        .timeline()
        .to(mesh.position, { x: x0 + 0.022, duration: 0.04, yoyo: true, repeat: 11, ease: 'none' })
        .to(mesh.position, { x: x0, duration: 0.04 }),
    );
    const at = mesh.position.clone();
    this.glowAt(at, p.danger, 0.3, s(showMs) * 0.6, 0.05);
    this.emit(this.add, at, {
      count: 30,
      color0: 0xffffff,
      color1: p.danger,
      size: 0.022,
      speed: 0.8,
      lifeMs: 550,
      gravity: -2,
    });
    this.emit(this.soft, at, {
      count: 10,
      color0: p.danger,
      color1: NIGHT,
      size: 0.03,
      shrink: 1.6,
      speed: 0.2,
      lifeMs: 900,
      gravity: 0.15,
    });
  }

  /** ¡ÚLTIMA!: amago, puñetazo (onda + sacudida + gong) y cadenas de luz. */
  private ultima(e: GameEvent): void {
    const p = this.p;
    const caller = e.e === 'ULTIMA_CALLED' ? e.player : undefined;
    const center = new THREE.Vector3(0, TABLE_Y, 0);
    // Anticipación: la cámara se recoge un instante antes del golpe.
    this.track(
      gsap
        .timeline()
        .to(this.lean, { y: 0.025, z: 0.02, duration: 0.14, ease: 'power2.out' })
        .to(this.lean, { y: 0, z: 0, duration: 0.25, ease: 'power3.in' }),
    );
    this.at(0.16, () => {
      this.screen.impact({ color: p.candle, flash: 0.3, trauma: 0.85 });
      this.screen.tintPulse(p.candle, 0.35, 700, 600);
      this.ring(center, p.candle, 0.95, 0.7);
      this.emit(this.add, center, {
        count: 90,
        color0: 0xffffff,
        color1: p.candle,
        size: 0.028,
        speed: 1.7,
        lifeMs: 1100,
        gravity: -1.8,
        spread: 1.2,
        radius: 0.1,
      });
      const totem = this.ctx.world.object('ultima-totem');
      if (totem) {
        const x = totem.position.x;
        this.track(
          gsap.fromTo(
            totem.position,
            { x },
            { x: x + 0.008, duration: 0.05, yoyo: true, repeat: 7 },
          ),
        );
      }
      if (caller) this.chains(caller);
    });
  }

  /** Cadenas de luz que sellan los tótems del cantor (docs/01 §11). */
  private chains(player: string): void {
    const p = this.p;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_SLOTS_SCAN; i++) {
      const m = this.ctx.world.totemMesh(player, i);
      if (m?.visible) pts.push(m.position.clone().setY(m.position.y + 0.02));
    }
    if (pts.length === 0) return;
    const first = pts[0];
    const line = this.temp(makeChain(first ? [...pts, first] : pts, p.candle));
    const mat = line.material as THREE.LineBasicMaterial;
    this.track(
      gsap
        .timeline({ onComplete: () => this.kill(line) })
        .fromTo(mat, { opacity: 0 }, { opacity: 1, duration: 0.15, repeat: 3, yoyo: true })
        .to(mat, { opacity: 1, duration: 0.5 })
        .to(mat, { opacity: 0, duration: 0.4 }),
    );
    pts.forEach((at, i) =>
      this.at(i * 0.05, () => {
        this.glowAt(at, p.candle, 0.16, 0.9, 0.1);
        this.emit(this.add, at, {
          count: 8,
          color0: p.candle,
          size: 0.016,
          speed: 0.35,
          lifeMs: 600,
          gravity: 0.4,
          spread: 0.3,
        });
      }),
    );
  }

  /** Revelación final: oleada de volteos con chispa, cámara se eleva. */
  private reveal(): void {
    const d = s(DURATIONS.reveal);
    this.track(
      gsap
        .timeline()
        .to(this.lean, { y: 0.18, duration: d * 0.6, ease: 'power1.out' })
        .to(this.lean, { y: 0, duration: 0.6, ease: 'power1.inOut' }),
    );
    const totems = this.ctx.world.allTotems();
    // Oleada ordenada por ángulo alrededor de la mesa: se lee como una ola.
    totems
      .map((m) => ({ m, a: Math.atan2(m.position.z, m.position.x) }))
      .sort((x, y) => x.a - y.a)
      .forEach(({ m }, i) => {
        const delay = 0.3 + i * Math.min(0.09, (d * 0.5) / Math.max(1, totems.length));
        const y0 = m.position.y;
        this.claim(m);
        this.track(
          gsap
            .timeline({ delay })
            .to(m.position, { y: y0 + 0.07, duration: 0.18, ease: 'power2.out' })
            .to(
              m.rotation,
              { x: m.rotation.x + Math.PI * 2, duration: 0.42, ease: 'back.out(1.4)' },
              0,
            )
            .to(m.position, { y: y0, duration: 0.22, ease: 'bounce.out' }, 0.2)
            .call(() =>
              this.emit(this.add, m.position, {
                count: 6,
                color0: this.p.ivory,
                size: 0.014,
                speed: 0.4,
                lifeMs: 400,
              }),
            ),
        );
      });
  }

  /** Carta de castigo: cae sobre el hueco con polvo rojo. */
  private penalty(e: GameEvent): void {
    if (e.e !== 'PENALTY_CARD') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    if (!mesh) return;
    const y0 = mesh.position.y;
    this.claim(mesh);
    this.track(
      gsap.fromTo(mesh.position, { y: y0 + 0.14 }, { y: y0, duration: 0.3, ease: 'bounce.out' }),
    );
    this.at(0.12, () => this.slam(mesh.position.clone().setY(y0), this.p.danger, 0.1, 0.14));
  }

  /** Match rechazado: el descarte «niega» con la cabeza y suelta humo gris. */
  private reject(): void {
    const pile = this.ctx.world.pileMesh('discard');
    if (pile) {
      const r0 = pile.rotation.y;
      this.track(
        gsap.fromTo(
          pile.rotation,
          { y: r0 - 0.12 },
          { y: r0, duration: 0.06, repeat: 3, yoyo: true },
        ),
      );
    }
    this.puff(v3(DISCARD_POSITION), 0x888899);
  }

  /** Eslabón de cadena: chispas que crecen con cada eslabón. */
  private chain(e: GameEvent): void {
    if (e.e !== 'CHAIN_LINK') return;
    const at = v3(DISCARD_POSITION);
    this.emit(this.add, at, {
      count: 10 + Math.min(5, e.link) * 6,
      color0: this.p.candle,
      color1: this.p.mystic,
      size: 0.02,
      speed: 0.9 + Math.min(5, e.link) * 0.12,
      lifeMs: 700,
      gravity: -1,
      spread: 0.6,
    });
    this.ring(at.setY(TABLE_Y), this.p.candle, 0.18 + Math.min(5, e.link) * 0.04, 0.4);
  }

  /** Robo de efecto: remolino místico en el descarte. */
  private steal(): void {
    const at = v3(DISCARD_POSITION).setY(TABLE_Y + 0.03);
    this.glowAt(at, this.p.mystic, 0.3, 0.5);
    this.stream(at, 0.5, 40, {
      count: 2,
      color0: this.p.mystic,
      color1: NIGHT,
      size: 0.018,
      speed: 0.5,
      lifeMs: 500,
      gravity: 0.6,
      spread: 0.2,
      radius: 0.06,
    });
  }

  /** Mazo rebarajado: el montón salta y suelta polvo. */
  private shuffle(): void {
    const pile = this.ctx.world.pileMesh('deck');
    if (pile) this.hop(pile, 0.03, 0.12);
    this.puff(v3(DECK_POSITION), this.p.ivory);
  }

  /** Fin de partida: lluvia de chispas sobre la mesa. */
  private victory(): void {
    const p = this.p;
    for (const c of [p.candle, p.mystic, p.ivory])
      this.emit(this.add, new THREE.Vector3(0, TABLE_Y + 0.5, 0), {
        count: 40,
        color0: c,
        size: 0.026,
        shrink: 0.8,
        speed: 1.4,
        lifeMs: 1800,
        gravity: -1.2,
        drag: 0.8,
        spread: 0.8,
        radius: 0.2,
      });
    this.screen.impact({ color: p.candle, flash: 0.15, trauma: 0.2 });
  }

  // --- piezas reutilizables ---------------------------------------------------

  /** Golpe contra la mesa: onda, polvo, chispas y sacudida. */
  private slam(at: THREE.Vector3, color: number, trauma: number, ringSize: number): void {
    const floor = at.clone().setY(TABLE_Y);
    this.ring(floor, color, ringSize, 0.35);
    this.emit(this.soft, floor, {
      count: 12,
      color0: this.p.woodLight,
      color1: NIGHT,
      size: 0.022,
      speed: 0.5,
      lifeMs: 420,
      gravity: -2,
      spread: 0.35,
      radius: 0.03,
    });
    this.emit(this.add, floor, {
      count: 8,
      color0: color,
      size: 0.016,
      speed: 0.7,
      lifeMs: 300,
      spread: 0.5,
    });
    this.screen.impact({ color, trauma });
  }

  private puff(at: THREE.Vector3, color: number): void {
    this.emit(this.soft, at, {
      count: 14,
      color0: color,
      color1: NIGHT,
      size: 0.03,
      shrink: 1.5,
      speed: 0.3,
      lifeMs: 600,
      gravity: 0.2,
      spread: 1.6,
      radius: 0.02,
    });
  }

  private ring(at: THREE.Vector3, color: number, size: number, dur: number): void {
    const r = this.temp(makeShockwave(color));
    r.position.copy(at);
    r.scale.setScalar(size * 0.15);
    const mat = r.material as THREE.MeshBasicMaterial;
    this.track(
      gsap
        .timeline({ onComplete: () => this.kill(r) })
        .to(r.scale, { x: size, y: size, z: size, duration: dur, ease: 'expo.out' })
        .to(mat, { opacity: 0, duration: dur, ease: 'power2.in' }, 0),
    );
  }

  private glowAt(at: THREE.Vector3, color: number, size: number, holdS: number, flicker = 0): void {
    const g = this.temp(makeGlow(color, 0.01));
    g.position.copy(at);
    const mat = g.material as THREE.SpriteMaterial;
    const tl = gsap
      .timeline({ onComplete: () => this.kill(g) })
      .to(g.scale, { x: size, y: size, duration: 0.18, ease: 'back.out(2)' })
      .to(g.scale, { x: size * 0.8, y: size * 0.8, duration: Math.max(0.01, holdS) }, '>')
      .to(mat, { opacity: 0, duration: 0.25 }, '>');
    if (flicker > 0)
      tl.to(
        mat,
        { opacity: 1 - flicker, duration: 0.09, repeat: Math.floor(holdS / 0.18), yoyo: true },
        0.18,
      );
    this.track(tl);
  }

  /** Estela de partículas que sigue a una malla durante `durS`. */
  private trail(obj: THREE.Object3D, color: number, durS: number, perS: number): void {
    const k = { t: 0 };
    let acc = 0;
    let last = 0;
    this.track(
      gsap.to(k, {
        t: durS,
        duration: durS,
        ease: 'none',
        onUpdate: () => {
          acc += (k.t - last) * perS;
          last = k.t;
          for (; acc >= 1; acc--)
            this.add.spawn({
              pos: obj.position.clone(),
              vel: new THREE.Vector3(0, 0.04, 0),
              lifeMs: 380,
              size0: 0.016,
              size1: 0.003,
              color0: color,
              color1: NIGHT,
              gravity: 0,
              drag: 2,
            });
        },
      }),
    );
  }

  /** Emisión continua desde un punto durante `durS` a `perS` ráfagas/s. */
  private stream(at: THREE.Vector3, durS: number, perS: number, o: BurstOptions): void {
    if (durS <= 0) return;
    const n = Math.max(1, Math.round(durS * perS));
    this.track(
      gsap.to(
        {},
        {
          duration: durS / n,
          repeat: n - 1,
          onRepeat: () => this.emit(o.color0 === NIGHT ? this.soft : this.add, at, o),
        },
      ),
    );
  }

  private emit(pool: ParticlePool, at: THREE.Vector3, o: BurstOptions): void {
    for (const sp of burstSpecs(at, o)) pool.spawn(sp);
  }

  /** Pequeño salto de un objeto (montones). */
  private hop(obj: THREE.Object3D, dy: number, durS: number): void {
    const y0 = obj.position.y;
    this.track(
      gsap.fromTo(obj.position, { y: y0 + dy }, { y: y0, duration: durS, ease: 'back.out(3)' }),
    );
  }

  /** Corta tweens previos sobre la malla para no acumular desplazamientos. */
  private claim(obj: THREE.Object3D): void {
    gsap.killTweensOf([obj.position, obj.rotation, obj.scale]);
  }

  private at(delayS: number, fn: () => void): void {
    this.track(gsap.delayedCall(delayS, fn));
  }

  private track<T extends gsap.core.Animation>(a: T): T {
    // Purga las ya terminadas; las infinitas (aleteo) se quedan hasta su kill.
    if (this.timelines.length > 64) {
      const live = this.timelines.filter((t) => t.progress() < 1 && !t.paused());
      this.timelines.length = 0;
      this.timelines.push(...live);
    }
    this.timelines.push(a);
    return a;
  }

  private temp<T extends THREE.Object3D>(obj: T): T {
    this.ctx.world.scene.add(obj);
    this.temps.push(obj);
    return obj;
  }

  private kill(obj: THREE.Object3D): void {
    this.ctx.world.scene.remove(obj);
    const i = this.temps.indexOf(obj);
    if (i >= 0) this.temps.splice(i, 1);
    gsap.killTweensOf(obj);
    disposeObject(obj);
  }

  /** Llamar cada frame: partículas, pantalla y offset de cámara (lean + sacudida). */
  update(dtMs: number): void {
    this.timeSec += dtMs / 1000;
    this.add.update(dtMs);
    this.soft.update(dtMs);
    this.screen.step(dtMs);
    this.screen.apply();
    const shake = shakeOffset(this.screen.trauma, this.timeSec, this.ctx.reducedMotion);
    this.ctx.world.cameraOffset.set(
      this.lean.x + shake.x,
      this.lean.y + shake.y,
      this.lean.z + shake.z,
    );
  }

  /** Diagnóstico (VfxDebug): partículas vivas y objetos temporales. */
  get stats(): { particles: number; temps: number } {
    return { particles: this.add.alive + this.soft.alive, temps: this.temps.length };
  }

  dispose(): void {
    for (const a of this.timelines) a.kill();
    this.timelines.length = 0;
    for (const o of [...this.temps]) this.kill(o);
    for (const pool of [this.add, this.soft]) {
      this.ctx.world.scene.remove(pool.points);
      pool.dispose();
    }
    this.screen.reset();
    this.ctx.world.cameraOffset.set(0, 0, 0);
  }
}
