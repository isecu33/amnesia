# AGENTS.md — @totem/client

> **Mapa estructural para agentes.** Regenerable con `/project-map`.
> Comportamiento y reglas → `../../CLAUDE.md` · Humanos/onboarding → `../../README.md`
> · Diseño y decisiones → `../../docs/02-arquitectura-tecnica.md` (§5.1, normativo)
> · Raíz del monorepo → `../../AGENTS.md`

- **Tipo:** app cliente (Vite + React + Three.js) dentro del monorepo `totem`
- **Stack:** TypeScript strict, React, Three.js, Zustand, GSAP, Colyseus.js, Vite, Vitest, Playwright
- **Estado:** MVP, deploy estático a Vercel

---

## 1. Mapa de directorios

```
packages/client/
├── src/
│   ├── main.tsx              [src]  bootstrap React
│   ├── net/                  [src]  WebSocket/Colyseus.js — client.ts, saved-session.ts
│   ├── state/                [src]  estado global Zustand — store.ts, subtitles.ts
│   ├── scene/                [src]  Three.js — world.ts (orquestador), layout.ts (herradura, poses de cámara, anclajes), camera-rig.ts, characters.ts (marionetas) + species.ts/poses.ts/rig-math.ts, rig-models.ts (experimento dev `?rigs=1`: animales GLB de `assets/` en la mesa), cards.ts (InstancedMesh de cartas), my-hands.ts, map-builder.ts + maps/ (descriptores de mapa), hud-layer.ts (HUD diegética: vela-reloj, tótem de ¡ÚLTIMA!, teclas grabadas), postfx.ts (render pixel + paleta), pixel.ts, textures.ts, palette.ts, reconcile.ts, anim-lock.ts
│   ├── presenter/             [src]  cola FIFO de eventos + timelines GSAP — queue.ts, timelines.ts; hud-model.ts (estado → indicadores de la HUD diegética) + hud-v2.ts (`deriveHudV2`: presagio/cadena/aro de robo desde PlayerView)
│   ├── vfx/                   [src]  efectos visuales — particles.ts (pools de partículas pixel, halos, ondas), sequences.ts (secuencias por evento), screen.ts (destello/viñeta/trauma → uniformes de postfx.ts) + vfx.test.ts
│   ├── audio/                  [src]  SFX vía WebAudio — audio.ts
│   ├── hud/                    [src]  React de HUD mínima sobre la mesa diegética (scene/hud-layer.ts): TurnPlate (quién juega, segundos, instrucción, última jugada) + ActionBar (acciones legales con tecla), ambas alimentadas por turn-guide.ts (lógica pura); estilos propios en hud.css; LogScroll (pergamino con L), SeatLabels (esquivan la placa vía seat-avoid.ts), ConnectionBanner, EmoteWheel, DoubleDrawChoice (elección Doble Robo), LastHumanDialog, SettingsPanel, Stats, Subtitles y slot-bar.ts (teclado)
│   ├── ui/                     [src]  pantallas React (App, Home, Lobby, Score, Table, Table3D, TutorialScreen, VfxDebug) + styles.css; lógica pura de apuntado en effect-targeting.ts (intent→acción, ayudas, Doble Robo, Salvaje) y keyboard-target.ts (Q/W + 1-8)
│   ├── tutorial/                [src]  engine.ts — 6 pasos guiados contra core en local, sin servidor
│   ├── i18n/                    [src]  diccionario es/en
│   └── settings/                [src]  store.ts de settings
├── e2e/smoke.spec.ts          [src]  test Playwright (fuera de src/)
├── vite.config.ts / vitest.config.ts / playwright.config.ts  [cfg]
├── tsconfig.json               [cfg]  extiende tsconfig.base.json
└── package.json                 [cfg]  @totem/client — depende de @totem/core y @totem/protocol (workspace:*)
```

## 2. Arranque y comandos

- **Entrada / `main`:** `src/main.tsx` (vía `index.html` + Vite)
- **Dev:** `pnpm --filter @totem/client dev` (o `pnpm dev` desde la raíz junto al servidor) — puerto `:5173`
- **Build:** `pnpm --filter @totem/client build` (`tsc --noEmit && vite build`)
- **Preview:** `pnpm --filter @totem/client preview`
- **Tests:** `pnpm --filter @totem/client test` (Vitest, jsdom) · `pnpm --filter @totem/client e2e` (Playwright, usa `E2E_BASE_URL`)
- **Config:** `VITE_WSS_URL` (URL del servidor Colyseus) documentada en `../../README.md`, sin `.env.example` en el repo. Deploy: `../../vercel.json`.

## 3. Dónde va qué (tarea → ubicación)

| Para… | Toca… |
|---|---|
| conexión/reconexión al servidor | `src/net/client.ts`, `src/net/saved-session.ts` |
| estado global de la app | `src/state/store.ts` (Zustand) |
| reproducir un evento del servidor como animación | `src/presenter/queue.ts` (cola FIFO) + `src/presenter/timelines.ts` (GSAP) |
| escena 3D / disposición de la mesa | `src/scene/world.ts`, `src/scene/layout.ts`, `src/scene/reconcile.ts` |
| personajes y sus animaciones | `src/scene/characters.ts`, `src/scene/poses.ts`, `src/scene/species.ts` |
| cargar/animar los rigs GLB de animales en partida | `src/scene/rig-models.ts` (solo dev, `?rigs=1`) |
| cámara (poses «mesa»/«mis tótems», giro) | `src/scene/camera-rig.ts` |
| mapa nuevo (cosmético) | `src/scene/maps/` (descriptor) + `src/scene/map-builder.ts` |
| post-procesado / texturas / paleta visual | `src/scene/postfx.ts`, `src/scene/textures.ts`, `src/scene/palette.ts` |
| efecto visual nuevo | `src/vfx/sequences.ts` (secuencia) + `src/presenter/timelines.ts` (beat/`VfxId`); piezas en `src/vfx/particles.ts`; destello/viñeta/sacudida en `src/vfx/screen.ts` |
| sonido | `src/audio/audio.ts` |
| pantalla o flujo de UI (React) | `src/ui/` + registrar en `src/ui/App.tsx` |
| indicador de estado en la mesa (HUD diegética) | `src/presenter/hud-model.ts` (qué) + `src/scene/hud-layer.ts` (cómo se pinta) |
| elemento de HUD React (placa de turno, acciones, log, etiquetas, emotes) | `src/hud/` (qué mostrar: `turn-guide.ts`; estilos: `hud.css`, no `ui/styles.css`) |
| apuntado de efectos / intent→acción / Doble Robo / igualar en Salvaje | `src/ui/effect-targeting.ts` (+ test) |
| tutorial guiado | `src/tutorial/engine.ts` |
| texto/traducción | `src/i18n/index.ts` |
| ajuste de usuario persistente | `src/settings/store.ts` |
| test de componente/unidad | co-ubicado (`*.test.ts`/`*.test.tsx`) junto al módulo |
| test E2E | `e2e/smoke.spec.ts` (Playwright) |

## 4. Capas y reglas de import

- `client` importa de `core` (para el tutorial local, que corre el motor sin servidor) y de `protocol` (validación/tipos de mensajes) — nunca de `server`.
- Flujo de capas dentro del cliente (§5.1 de la arquitectura, normativo): `net` → `state` (Zustand) → `presenter` → `scene` / `vfx` / `audio` → `ui` (React solo para HUD/menús, no lógica de juego).
- El `presenter` consume una cola FIFO de eventos del servidor y los reproduce con timelines GSAP — evita que la puesta en escena se adelante al servidor.
- La comunicación con el servidor pasa siempre por `net/client.ts` usando los esquemas de `protocol`; ningún otro módulo abre su propia conexión WS.
- Detalle normativo: `../../docs/02-arquitectura-tecnica.md` §5.1.

## 5. Convenciones locales de estructura

- **Naming:** carpetas por capa funcional (`net`, `state`, `scene`, `presenter`, `vfx`, `audio`, `hud`, `ui`, `tutorial`, `i18n`, `settings`); componentes React en `PascalCase.tsx`, módulos lógicos en `camelCase.ts`.
- **Tests:** co-ubicados (`audio/audio.test.ts`, `i18n/i18n.test.ts`, `net/saved-session.test.ts`, `presenter/queue.test.ts`, `scene/layout.test.ts`, `scene/reconcile.test.ts`, `state/log-privacy.test.ts`, `tutorial/tutorial.test.ts`, `ui/fixes.test.tsx`, `ui/menus.test.tsx`, `ui/screens.test.tsx`) con Testing Library + jsdom; E2E aparte en `e2e/smoke.spec.ts` con Playwright.
- **NO tocar:** no metas lógica de reglas del juego en `ui/`/`hud/` — eso vive en `core` y llega ya resuelto vía `state`/`presenter`.

## 6. Mapas anidados

Ninguno (las subcarpetas de `src/` son capas funcionales, no subsistemas independientes).

## 7. Mantenimiento

Regenerable con `/project-map`. **No** metas aquí comportamiento (→ `../../CLAUDE.md`),
onboarding (→ `../../README.md`) ni rationale de diseño (→ `../../docs/02-arquitectura-tecnica.md`).
Si una ruta de este mapa deja de existir, re-ejecuta `/project-map`.

## Cambios estructurales recientes

- 2026-11-15 — `src/hud/seat-avoid.ts` (+test) añadido: las etiquetas de asiento esquivan la placa de turno.
- 2026-11-14 — `src/hud/`: `TurnPlate.tsx`, `ActionBar.tsx`, `turn-guide.ts` (+tests) y `hud.css` añadidos; `EffectHint.tsx` eliminado (su aviso vive en TurnPlate).
- 2026-11-14 — `src/vfx/screen.ts` (efectos de pantalla) y `src/vfx/vfx.test.ts` añadidos.
- 2026-11-14 — `src/scene/rig-models.ts` añadido (rigs GLB en partida, experimento dev).
