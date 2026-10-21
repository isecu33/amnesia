/**
 * Regresión de D-040. El bug que este test fija costó todo el WP-11: la
 * reconciliación de datos escribía `position`/`rotation` en cada frame y pisaba
 * las tweens de GSAP antes del `render()`, así que las secuencias vistosas
 * existían, se ejecutaban… y no se veían. Nada lo detectaba porque ningún test
 * tocaba a la vez el bucle de render y una animación.
 */
import { describe, expect, it, afterEach } from 'vitest';
import gsap from 'gsap';
import * as THREE from 'three';
import { reconcileTotem } from './reconcile.js';
import { isTransformLocked, lockTransform, unlockTransform } from './anim-lock.js';

const obj = (): THREE.Object3D => new THREE.Object3D();
const state = (y: number, empty = false) => ({ pos: { x: 0, y, z: 0 }, own: true, empty });

afterEach(() => {
  gsap.globalTimeline.clear();
  gsap.killTweensOf('*');
});

describe('D-040 · arbitraje entre la reconciliación y las tweens', () => {
  it('la reconciliación coloca el tótem cuando nadie lo está animando', () => {
    const m = obj();
    reconcileTotem(m, state(0.5));
    expect(m.position.y).toBe(0.5);
    expect(m.rotation.y).toBe(0);
  });

  it('NO pisa una posición con tween viva, ni siquiera antes del primer tick', () => {
    const m = obj();
    m.position.set(0, 1, 0);
    gsap.to(m.position, { y: 2, duration: 1 });

    // Este es el momento crítico: la tween acaba de crearse y todavía no ha
    // hecho tick. `gsap.isTweening()` aquí dice `false`; el bucle de render
    // llamaba a update() justo en esta ventana.
    expect(isTransformLocked(m, 'position')).toBe(true);
    reconcileTotem(m, state(0.5));
    expect(m.position.y).toBe(1);
  });

  it('tampoco pisa la rotación con tween viva', () => {
    const m = obj();
    m.rotation.y = 0;
    gsap.to(m.rotation, { y: Math.PI, duration: 1 });
    reconcileTotem(m, { pos: { x: 0, y: 0, z: 0 }, own: false, empty: false });
    expect(m.rotation.y).toBe(0);
  });

  it('recupera el control en cuanto la tween muere', () => {
    const m = obj();
    m.position.set(0, 1, 0);
    const tw = gsap.to(m.position, { y: 2, duration: 1 });
    tw.kill();
    reconcileTotem(m, state(0.5));
    expect(m.position.y).toBe(0.5);
  });

  it('un tótem animándose no se apaga a media animación (E21 sigue valiendo al acabar)', () => {
    const m = obj();
    m.visible = true;
    gsap.to(m.position, { y: 2, duration: 1 });
    reconcileTotem(m, state(0.5, true));
    expect(m.visible).toBe(true); // sigue en pantalla mientras salta al descarte
    expect(m.userData['empty']).toBe(true); // pero ya no es clicable

    gsap.killTweensOf(m.position);
    reconcileTotem(m, state(0.5, true));
    expect(m.visible).toBe(false); // el hueco queda apagado, sin compactar
  });

  it('el bloqueo explícito funciona para animaciones que no pasan por GSAP', () => {
    const m = obj();
    m.position.set(0, 1, 0);
    lockTransform(m, ['position']);
    reconcileTotem(m, state(0.5));
    expect(m.position.y).toBe(1);
    unlockTransform(m, ['position']);
    reconcileTotem(m, state(0.5));
    expect(m.position.y).toBe(0.5);
  });
});
