/**
 * Reconciliación datos → escena (D-040). Único sitio donde se escribe el
 * transform de un tótem a partir de la vista del servidor: así el arbitraje con
 * las tweens de `vfx/sequences` está centralizado y es testeable sin WebGL.
 */
import type * as THREE from 'three';
import type { Vec3 } from './layout.js';
import { isTransformBusy, isTransformLocked } from './anim-lock.js';

export interface TotemState {
  pos: Vec3;
  /** los tótems propios miran a la cámara; los de los rivales, al revés */
  own: boolean;
  /** E21: un slot vaciado no se compacta, solo se apaga */
  empty: boolean;
}

export function reconcileTotem(mesh: THREE.Object3D, s: TotemState): void {
  if (!isTransformLocked(mesh, 'position')) mesh.position.set(s.pos.x, s.pos.y, s.pos.z);
  if (!isTransformLocked(mesh, 'rotation')) mesh.rotation.y = s.own ? 0 : Math.PI;
  // La interacción sí es inmediata: un hueco deja de ser clicable al instante.
  mesh.userData['empty'] = s.empty;
  // Un tótem que se está animando no se apaga a media animación (p. ej. el salto
  // al descarte de MATCH_OK, que vacía el slot en cuanto arranca la timeline).
  if (!isTransformBusy(mesh)) mesh.visible = !s.empty;
}
