/**
 * Postproceso — docs/02 §5.3: Bloom(0.3) + Vignette + FilmGrain, y OutlinePass
 * para los interactuables. Valores y paleta de docs/01 §12.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Palette } from './palette.js';

export const BLOOM_STRENGTH = 0.3;
export const VIGNETTE_STRENGTH = 0.9;
export const GRAIN_STRENGTH = 0.06;

/** Viñeta + grano de película en una sola pasada (una menos que encadenarlas). */
export const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: VIGNETTE_STRENGTH },
    uGrain: { value: GRAIN_STRENGTH },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Viñeta: oscurece hacia los bordes.
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(d) * uVignette * 1.6);
      color.rgb *= mix(0.55, 1.0, vig);
      // Grano sutil, animado.
      float g = hash(vUv * 1024.0 + uTime) - 0.5;
      color.rgb += g * uGrain;
      gl_FragColor = color;
    }
  `,
};

export interface PostFx {
  composer: EffectComposer;
  outline: OutlinePass;
  setSize(w: number, h: number): void;
  update(timeSec: number): void;
  dispose(): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  palette: Palette,
  size: { width: number; height: number },
): PostFx {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.width, size.height),
    BLOOM_STRENGTH,
    0.5,
    0.85,
  );
  composer.addPass(bloom);

  // OutlinePass: solo lo interactuable lleva contorno (docs/01 §11).
  const outline = new OutlinePass(
    new THREE.Vector2(size.width, size.height),
    scene,
    camera as THREE.PerspectiveCamera,
  );
  outline.edgeStrength = 3.2;
  outline.edgeGlow = 0.4;
  outline.edgeThickness = 1.1;
  outline.pulsePeriod = 2.4;
  outline.visibleEdgeColor.setHex(palette.mystic);
  outline.hiddenEdgeColor.setHex(0x000000);
  composer.addPass(outline);

  const grain = new ShaderPass(GrainVignetteShader);
  composer.addPass(grain);
  composer.addPass(new OutputPass());

  return {
    composer,
    outline,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
      outline.setSize(w, h);
    },
    update(timeSec) {
      const u = grain.uniforms['uTime'];
      if (u) u.value = timeSec;
    },
    dispose() {
      composer.dispose();
      outline.dispose();
      bloom.dispose();
    },
  };
}
