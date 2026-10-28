/**
 * Las 7 secuencias vistosas — docs/03 WP-11, duraciones de docs/01 §11.
 * Cada una devuelve una timeline GSAP registrada en el presenter.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { GameEvent } from '@totem/core';
import { DURATIONS } from '../presenter/timelines.js';
import { paletteFor } from '../scene/palette.js';
import { DISCARD_POSITION } from '../scene/layout.js';
import type { World } from '../scene/world.js';
import { Burst, makeCrow, makeSmoke } from './particles.js';

export type SequenceId =
  | 'drawDeck'
  | 'drawDiscard'
  | 'discard'
  | 'swap'
  | 'peek'
  | 'spy'
  | 'blindSwap'
  | 'matchOk'
  | 'matchFail'
  | 'ultima'
  | 'reveal';

export interface VfxContext {
  world: World;
  colorBlind: boolean;
  reducedMotion: boolean;
  /** identificador del jugador local, para saber si la cámara se inclina */
  youId: string;
}

const s = (ms: number): number => ms / 1000;

export class Vfx {
  private readonly bursts: Burst[] = [];
  private readonly temps: THREE.Object3D[] = [];

  constructor(private ctx: VfxContext) {}

  setContext(ctx: Partial<VfxContext>): void {
    this.ctx = { ...this.ctx, ...ctx };
  }

  /** Punto de entrada del presenter. */
  play(id: SequenceId, e: GameEvent): void {
    if (this.ctx.reducedMotion) return; // accesibilidad: sin movimiento superfluo
    switch (id) {
      case 'drawDeck':
      case 'drawDiscard':
        return this.draw(id === 'drawDeck');
      case 'discard':
        return this.discard();
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
        return this.ultima();
      case 'reveal':
        return this.reveal();
    }
  }

  /**
   * Robar: la mano del personaje (o la tuya) ya lleva la carta (D-042); aquí solo
   * se levanta un poco de polvo del montón.
   */
  private draw(fromDeck: boolean): void {
    const pile = this.ctx.world.pileMesh(fromDeck ? 'deck' : 'discard');
    if (!pile) return;
    const p = paletteFor(this.ctx.colorBlind);
    this.burst(pile.getWorldPosition(new THREE.Vector3()), {
      count: 10,
      color: p.ivory,
      size: 0.02,
      speed: 0.25,
      lifeMs: 400,
    });
  }

  /** Descartar: arco hasta el descarte, golpe seco. */
  private discard(): void {
    const discard = this.ctx.world.pileMesh('discard');
    if (!discard) return;
    gsap
      .timeline()
      .fromTo(
        discard.position,
        { y: DISCARD_POSITION.y + 0.22 },
        { y: DISCARD_POSITION.y, duration: s(DURATIONS.discard), ease: 'bounce.out' },
      )
      .fromTo(discard.rotation, { z: 0.5 }, { z: 0, duration: s(DURATIONS.discard) }, 0);
  }

  /** Sustituir: cruce de las dos cartas en el aire. */
  private swap(e: GameEvent): void {
    if (e.e !== 'SWAPPED_DRAWN') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    if (!mesh) return;
    gsap
      .timeline()
      .to(mesh.position, {
        y: mesh.position.y + 0.16,
        duration: s(DURATIONS.swap) / 2,
        ease: 'power2.out',
      })
      .to(mesh.position, { y: mesh.position.y, duration: s(DURATIONS.swap) / 2, ease: 'power2.in' })
      .to(mesh.rotation, { y: mesh.rotation.y + Math.PI * 2, duration: s(DURATIONS.swap) }, 0);
  }

  /** Vislumbre: tu tótem se alza 15° hacia ti con halo de vela. */
  private peek(e: GameEvent): void {
    if (e.e !== 'PRIVATE_REVEAL') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    if (!mesh) return;
    const p = paletteFor(this.ctx.colorBlind);
    this.burst(mesh.position, { count: 24, color: p.candle, size: 0.03, speed: 0.35, lifeMs: 700 });
    gsap
      .timeline()
      .to(mesh.rotation, { x: -(Math.PI / 180) * 15, duration: 0.25 })
      .to(mesh.position, { y: mesh.position.y + 0.05, duration: 0.25 }, 0)
      .to(mesh.rotation, { x: 0, duration: 0.3 }, s(e.ttlMs) - 0.3)
      .to(mesh.position, { y: mesh.position.y, duration: 0.3 }, s(e.ttlMs) - 0.3);
  }

  /** Espionaje: un cuervo espectral vuela del descarte al tótem rival. */
  private spy(e: GameEvent): void {
    if (e.e !== 'PRIVATE_REVEAL') return;
    const target = this.ctx.world.totemMesh(e.player, e.slot);
    if (!target) return;
    const p = paletteFor(this.ctx.colorBlind);
    const crow = makeCrow(p.mystic);
    crow.position.set(DISCARD_POSITION.x, DISCARD_POSITION.y + 0.1, DISCARD_POSITION.z);
    this.ctx.world.scene.add(crow);
    this.temps.push(crow);
    const wings = crow.children.filter((c) => c.name.startsWith('wing'));
    gsap.to(
      wings.map((w) => w.rotation),
      { x: Math.PI / 2 + 0.6, duration: 0.14, yoyo: true, repeat: -1 },
    );
    gsap
      .timeline({ onComplete: () => this.kill(crow) })
      .to(crow.position, {
        x: target.position.x,
        y: target.position.y + 0.12,
        z: target.position.z,
        duration: s(DURATIONS.spy) * 0.35,
        ease: 'power1.inOut',
      })
      .to(
        crow.position,
        {
          x: DISCARD_POSITION.x,
          y: DISCARD_POSITION.y + 0.1,
          z: DISCARD_POSITION.z,
          duration: s(DURATIONS.spy) * 0.35,
          ease: 'power1.inOut',
        },
        s(DURATIONS.spy) * 0.6,
      );
    // Leve lean de la cámara hacia el objetivo (docs/02 §5.3).
    const cam = this.ctx.world.camera;
    gsap.to(this.ctx.world.cameraOffset, {
      x: (target.position.x - cam.position.x) * 0.06,
      duration: s(DURATIONS.spy) * 0.5,
      yoyo: true,
      repeat: 1,
    });
  }

  /** Trueque Ciego: zarcillos de humo cruzan los dos tótems. */
  private blindSwap(e: GameEvent): void {
    if (e.e !== 'EFFECT_RESOLVED' || e.publicInfo.slots.length < 2) return;
    const [a, b] = e.publicInfo.slots;
    const ma = a ? this.ctx.world.totemMesh(a.player, a.slot) : undefined;
    const mb = b ? this.ctx.world.totemMesh(b.player, b.slot) : undefined;
    if (!ma || !mb) return;
    const p = paletteFor(this.ctx.colorBlind);
    const smoke = makeSmoke(p.mystic, 60);
    this.ctx.world.scene.add(smoke);
    this.temps.push(smoke);
    const attr = smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const proxy = { t: 0 };
    gsap.to(proxy, {
      t: 1,
      duration: s(DURATIONS.blindSwap),
      onUpdate: () => {
        for (let i = 0; i < arr.length / 3; i++) {
          const k = (i / (arr.length / 3) + proxy.t) % 1;
          arr[i * 3] = THREE.MathUtils.lerp(ma.position.x, mb.position.x, k);
          arr[i * 3 + 1] = ma.position.y + Math.sin(k * Math.PI) * 0.2;
          arr[i * 3 + 2] = THREE.MathUtils.lerp(ma.position.z, mb.position.z, k);
        }
        attr.needsUpdate = true;
      },
      onComplete: () => this.kill(smoke),
    });
    for (const m of [ma, mb]) {
      gsap.to(m.rotation, { y: m.rotation.y + Math.PI, duration: s(DURATIONS.blindSwap) });
    }
  }

  /** Match acierto: el tótem salta al descarte con chispas. */
  private matchOk(e: GameEvent): void {
    if (e.e !== 'MATCH_OK') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    const p = paletteFor(this.ctx.colorBlind);
    const origin = mesh?.position.clone() ?? new THREE.Vector3(0, 0.8, 0);
    this.burst(origin, { count: 48, color: p.mystic, size: 0.035, speed: 1.1, lifeMs: 700 });
    if (!mesh) return;
    gsap.timeline().to(mesh.position, {
      x: DISCARD_POSITION.x,
      y: DISCARD_POSITION.y + 0.05,
      z: DISCARD_POSITION.z,
      duration: s(DURATIONS.matchOk),
      ease: 'power2.in',
    });
  }

  /** Match fallo: temblor, flash rojo, 2 s de revelación pública, carta de castigo. */
  private matchFail(e: GameEvent): void {
    if (e.e !== 'MATCH_FAIL') return;
    const mesh = this.ctx.world.totemMesh(e.player, e.slot);
    const p = paletteFor(this.ctx.colorBlind);
    if (mesh) {
      const x0 = mesh.position.x;
      gsap
        .timeline()
        .to(mesh.position, { x: x0 + 0.02, duration: 0.05, yoyo: true, repeat: 9 })
        .to(mesh.position, { x: x0, duration: 0.05 });
      this.burst(mesh.position, {
        count: 30,
        color: p.danger,
        size: 0.03,
        speed: 0.7,
        lifeMs: 600,
      });
    }
    // Vibración de cámara.
    gsap.fromTo(
      this.ctx.world.cameraOffset,
      { y: 0 },
      { y: 0.01, duration: 0.06, yoyo: true, repeat: 5 },
    );
  }

  /** ¡ÚLTIMA!: puñetazo en la mesa, gong, cadenas de luz. */
  private ultima(): void {
    const p = paletteFor(this.ctx.colorBlind);
    gsap.fromTo(
      this.ctx.world.cameraOffset,
      { y: 0 },
      { y: -0.03, duration: 0.09, yoyo: true, repeat: 3 },
    );
    // El tótem de piedra se sacude un instante (la antigua campana).
    const totem = this.ctx.world.object('ultima-totem');
    if (totem && !this.ctx.reducedMotion) {
      const x = totem.position.x;
      gsap.fromTo(totem.position, { x }, { x: x + 0.008, duration: 0.05, yoyo: true, repeat: 7 });
    }
    this.burst(new THREE.Vector3(0, 0.9, 0), {
      count: 80,
      color: p.candle,
      size: 0.04,
      speed: 1.6,
      lifeMs: s(DURATIONS.ultima) * 1000,
      spread: 1.6,
    });
  }

  /** Revelación final: todas las manos se voltean en oleada, cámara se eleva. */
  private reveal(): void {
    // La cámara se eleva y vuelve: el offset se suma a la pose del CameraRig.
    gsap
      .timeline()
      .to(this.ctx.world.cameraOffset, {
        y: 0.18,
        duration: s(DURATIONS.reveal) * 0.6,
        ease: 'power1.out',
      })
      .to(this.ctx.world.cameraOffset, { y: 0, duration: 0.6 });
    let i = 0;
    for (const mesh of this.ctx.world.allTotems()) {
      gsap.to(mesh.rotation, {
        x: Math.PI * 2,
        duration: 0.45,
        delay: (i % 12) * 0.09,
        ease: 'back.out(1.4)',
      });
      i++;
    }
  }

  // --- utilidades ----------------------------------------------------------

  private burst(origin: THREE.Vector3, opts: ConstructorParameters<typeof Burst>[1]): void {
    const b = new Burst(origin.clone(), opts);
    this.ctx.world.scene.add(b.points);
    this.bursts.push(b);
  }

  private kill(obj: THREE.Object3D): void {
    this.ctx.world.scene.remove(obj);
    const i = this.temps.indexOf(obj);
    if (i >= 0) this.temps.splice(i, 1);
  }

  /** Llamar cada frame. */
  update(dtMs: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      if (!b) continue;
      if (!b.update(dtMs)) {
        this.ctx.world.scene.remove(b.points);
        b.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const b of this.bursts) {
      this.ctx.world.scene.remove(b.points);
      b.dispose();
    }
    this.bursts.length = 0;
    for (const o of [...this.temps]) this.kill(o);
  }
}
