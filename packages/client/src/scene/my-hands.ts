/**
 * Tus manos (docs/01 §11, D-042): solo aparecen durante TUS acciones (robar,
 * sostener la carta, sustituir, golpe de Descarte Rápido) para no tapar tus
 * tótems. Viven en el espacio de la cámara.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import { SPECIES, type SpeciesId } from './species.js';

/** Posiciones en espacio de cámara (x derecha, y arriba, -z delante). */
const HOLD_R = new THREE.Vector3(0.2, -0.12, -0.42);
const AWAY_R = new THREE.Vector3(0.28, -0.42, -0.36);
const AWAY_L = new THREE.Vector3(-0.28, -0.42, -0.36);

export type HandMove = 'draw' | 'release' | 'slap';

export class MyHands {
  readonly group = new THREE.Group();
  readonly right = new THREE.Group();
  readonly left = new THREE.Group();
  /** de aquí cuelga la carta que sostienes */
  readonly rightAnchor = new THREE.Object3D();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private holding = false;
  private busy = false;

  constructor(species: SpeciesId) {
    this.geometry = new THREE.BoxGeometry(0.07, 0.05, 0.09);
    this.material = new THREE.MeshLambertMaterial({
      color: SPECIES[species].fur,
      flatShading: true,
    });
    for (const [h, away] of [
      [this.right, AWAY_R],
      [this.left, AWAY_L],
    ] as const) {
      const mitten = new THREE.Mesh(this.geometry, this.material);
      mitten.rotation.x = -0.5;
      h.add(mitten);
      h.position.copy(away);
      h.visible = false;
      this.group.add(h);
    }
    // La carta, de cara a ti y con la parte de arriba hacia arriba.
    this.rightAnchor.position.set(-0.02, 0.07, -0.02);
    this.rightAnchor.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 - 0.25),
      );
    this.right.add(this.rightAnchor);
  }

  setSpecies(species: SpeciesId): void {
    this.material.color.setHex(SPECIES[species].fur);
  }

  /** Estado persistente: ¿tienes una carta robada en la mano? */
  setHolding(on: boolean, reduced: boolean): void {
    if (on === this.holding) return;
    this.holding = on;
    if (this.busy) return;
    this.moveRight(on ? HOLD_R : AWAY_R, reduced ? 0 : 0.28, !on);
  }

  play(move: HandMove, reduced: boolean): void {
    const d = reduced ? 0 : 1;
    if (move === 'draw') {
      this.right.visible = true;
      this.right.position.copy(AWAY_R);
      this.moveRight(HOLD_R, 0.3 * d, false);
      this.holding = true;
      return;
    }
    if (move === 'release') {
      this.busy = true;
      gsap
        .timeline({
          onComplete: () => {
            this.busy = false;
            if (!this.holding) this.right.visible = false;
          },
        })
        .to(this.right.position, { x: 0.05, y: -0.2, z: -0.55, duration: 0.15 * d })
        .to(this.right.position, { ...vec(AWAY_R), duration: 0.25 * d });
      this.holding = false;
      return;
    }
    // Golpe de Descarte Rápido: la izquierda baja de golpe y se retira.
    this.left.visible = true;
    gsap
      .timeline({ onComplete: () => (this.left.visible = false) })
      .fromTo(
        this.left.position,
        { ...vec(AWAY_L) },
        { x: -0.04, y: -0.3, z: -0.5, duration: 0.09 * d, ease: 'power4.in' },
      )
      .to(this.left.position, { ...vec(AWAY_L), duration: 0.22 * d });
  }

  private moveRight(to: THREE.Vector3, duration: number, hideAfter: boolean): void {
    this.right.visible = true;
    gsap.killTweensOf(this.right.position);
    gsap.to(this.right.position, {
      ...vec(to),
      duration,
      ease: 'power2.out',
      onComplete: () => {
        if (hideAfter) this.right.visible = false;
      },
    });
  }

  dispose(): void {
    gsap.killTweensOf(this.right.position);
    gsap.killTweensOf(this.left.position);
    this.geometry.dispose();
    this.material.dispose();
  }
}

const vec = (v: THREE.Vector3): { x: number; y: number; z: number } => ({ x: v.x, y: v.y, z: v.z });
