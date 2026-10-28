/**
 * Postproceso pixel-3D (D-042, revisa docs/02 §5.3): la escena se renderiza a un
 * objetivo de ~540 px de alto (el `<canvas>` se escala con `image-rendering:
 * pixelated`) y una única pasada aplica viñeta + cuantización a la paleta cerrada
 * del mapa con tramado ordenado 4×4. Sin film grain: a 360 px era ruido que
 * parpadeaba. Sin `OutlinePass`: re-renderizaba la escena (ver `cards.ts`).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const BLOOM_STRENGTH = 0.3;
export const VIGNETTE_STRENGTH = 0.9;
/** D-042: el grano se elimina (antes 0,06). Se conserva el uniforme por compatibilidad. */
export const GRAIN_STRENGTH = 0;
/** Alto interno del render; configurable (docs/05 §4.6). */
export const DEFAULT_PIXEL_HEIGHT = 540;
export const MAX_PALETTE = 32;
export const DITHER_STRENGTH = 0.045;

/** Viñeta + grano en una sola pasada (D-021). Se mantiene para la escena de depuración. */
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
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(d) * uVignette * 1.6);
      color.rgb *= mix(0.55, 1.0, vig);
      float g = hash(vUv * 1024.0 + uTime) - 0.5;
      color.rgb += g * uGrain;
      gl_FragColor = color;
    }
  `,
};

/** Viñeta + paleta cerrada con tramado Bayer 4×4, en espacio de pantalla (sRGB). */
export const PaletteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uPalette: { value: Array.from({ length: MAX_PALETTE }, () => new THREE.Vector3()) },
    uCount: { value: 0 },
    uDither: { value: DITHER_STRENGTH },
    uVignette: { value: VIGNETTE_STRENGTH },
    uResolution: { value: new THREE.Vector2(960, 540) },
  },
  vertexShader: GrainVignetteShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uPalette[${MAX_PALETTE}];
    uniform int uCount;
    uniform float uDither;
    uniform float uVignette;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float bayer(vec2 p) {
      int x = int(mod(p.x, 4.0));
      int y = int(mod(p.y, 4.0));
      int i = x + y * 4;
      float m[16];
      m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
      m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
      float v = 0.0;
      for (int k = 0; k < 16; k++) if (k == i) v = m[k];
      return v / 16.0 - 0.5;
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(d) * uVignette * 1.4);
      c *= mix(0.6, 1.0, vig);
      c += bayer(floor(vUv * uResolution)) * uDither;
      vec3 best = c;
      float bestD = 1e9;
      for (int i = 0; i < ${MAX_PALETTE}; i++) {
        if (i >= uCount) break;
        vec3 diff = (c - uPalette[i]) * vec3(0.30, 0.59, 0.11);
        float dist = dot(diff, diff) + dot(c - uPalette[i], c - uPalette[i]) * 0.15;
        if (dist < bestD) { bestD = dist; best = uPalette[i]; }
      }
      gl_FragColor = vec4(uCount > 0 ? best : c, 1.0);
    }
  `,
};

export interface PostFx {
  composer: EffectComposer;
  setSize(w: number, h: number): void;
  update(timeSec: number): void;
  setPalette(colors: readonly number[]): void;
  dispose(): void;
}

export interface PostFxOptions {
  width: number;
  height: number;
  palette: readonly number[];
  /** bloom de docs/02 §5.3; apagado por defecto: suma ~10 pasadas */
  bloom?: boolean;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: PostFxOptions,
): PostFx {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = opts.bloom
    ? new UnrealBloomPass(new THREE.Vector2(opts.width, opts.height), BLOOM_STRENGTH, 0.4, 0.85)
    : undefined;
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const palette = new ShaderPass(PaletteShader);
  composer.addPass(palette);

  const setPalette = (colors: readonly number[]): void => {
    const arr = palette.uniforms['uPalette']?.value as THREE.Vector3[];
    const list = colors.slice(0, MAX_PALETTE);
    list.forEach((c, i) => {
      arr[i]?.set(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
    });
    const count = palette.uniforms['uCount'];
    if (count) count.value = list.length;
  };
  setPalette(opts.palette);

  return {
    composer,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom?.setSize(w, h);
      (palette.uniforms['uResolution']?.value as THREE.Vector2).set(w, h);
    },
    update() {
      // Sin animación de grano: la imagen pixel queda estable.
    },
    setPalette,
    dispose() {
      composer.dispose();
      bloom?.dispose();
    },
  };
}
