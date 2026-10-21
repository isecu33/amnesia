# TÓTEM

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=flat&logo=threedotjs&logoColor=white)
![Colyseus](https://img.shields.io/badge/Colyseus-3B2E7E?style=flat&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)

> **Note:** This repository was originally named *amnesia* during early development. The project is **TOTEM**.

Juego de cartas online (2–6 jugadores) de memoria, riesgo y reflejos, en primera
persona. Monorepo TypeScript: lógica pura (`core`) + servidor autoritativo
Colyseus (`server`) + cliente (`client`) + esquemas compartidos (`protocol`).

> Las reglas normativas están en [`docs/01-gdd-y-reglas-totem.md`](docs/01-gdd-y-reglas-totem.md);
> los contratos técnicos en [`docs/02-arquitectura-tecnica.md`](docs/02-arquitectura-tecnica.md);
> el plan por paquetes de trabajo en [`docs/03-plan-y-guia-agentes.md`](docs/03-plan-y-guia-agentes.md).
> Si el código y los docs discrepan, mandan los docs.

## Quickstart (< 5 min)

```bash
corepack enable            # o: npm i -g pnpm@9
pnpm install
pnpm dev                   # server en :2567 y cliente en :5173
```

Abre <http://localhost:5173>, escribe tu nombre y pulsa **Crear sala**. Comparte
el código de 5 letras; para jugar solo, añade bots desde el lobby y pulsa
**Empezar partida**. Con dos pestañas del navegador tienes dos jugadores.

## Screenshots

> TODO: add gameplay screenshots

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta servidor y cliente |
| `pnpm -r test` | Toda la batería de tests |
| `pnpm -r typecheck` | TypeScript strict en todos los paquetes |
| `pnpm -r lint` / `pnpm lint` | ESLint + Prettier |
| `pnpm --filter @totem/core test:cov` | Cobertura de `core` (umbral 90 %) |
| `pnpm sim -- --games 500` | Fuzz de partidas bot-vs-bot contra `core` (I10) |
| `pnpm replay <fichero.json>` | Re-simula y verifica una partida grabada |
| `pnpm --filter @totem/client e2e` | Smoke Playwright (crear sala, 2 pestañas, tutorial, VFX) |
| `pnpm dev` + `?scene=vfx` | Escena de depuración: dispara cada secuencia VFX aislada |
| `pnpm dev` + `?stats=1` | Overlay de fps, draw calls y triángulos (presupuesto de docs/02 §5.3) |

Antes de dar nada por terminado: `pnpm -r typecheck && pnpm -r test` en verde.

## Estructura

```
packages/core       LÓGICA PURA. Cero IO, cero Date.now, cero Math.random.
packages/protocol   Esquemas zod C2S/S2C + PROTOCOL_VERSION + códigos de sala.
packages/server     Colyseus: salas, timers, arbitraje, bots, replays.
packages/client     Vite + React + Three.js + GSAP.
  scene/            mesa, cámara primera persona, tótems, luces, texturas por código
  presenter/        cola de animación FIFO y tabla de tiempos (puro, testeable)
  vfx/              las 7 secuencias vistosas + partículas propias
  audio/            SFX placeholder sintetizados con WebAudio
  hud/              vela-reloj, marcador, emotes, subtítulos, ajustes
  tutorial/         6 pasos guiados contra core en local, sin servidor
tools/sim           Fuzzing de invariantes I1–I10.
```

## Estado del plan

| Fase | Paquetes | Estado |
|---|---|---|
| F0 | WP-00 andamiaje | ✅ |
| F1 | WP-01…04 motor de reglas | ✅ API de `core` congelada |
| F2 | WP-05…07 protocolo, servidor, bots, replays | ✅ |
| F3 | WP-08 gray-box jugable | ✅ **gate de diversión: juega aquí antes de seguir** |
| F4 | WP-09 escena 3D · WP-10 interacción y cola de animación | ✅ |
| F5 | WP-11 VFX · WP-12 HUD diegético | ✅ |
| F6 | WP-13 meta · WP-14 tutorial y pulido | ✅ |
| F7 | WP-15 accesibilidad e i18n · WP-16 deploy y E2E · WP-17 telemetría y balance | ✅ |

Pendiente de verificación humana: el gate de diversión de F3, la medida de
60 fps / ≤ 80 draw calls (abre la mesa con `?stats=1`, docs/03 WP-09) y las
sesiones de playtest de WP-17. El arte y el audio son placeholder generados por
código hasta el pase final de F6.

## Accesibilidad

Ajustes siempre accesibles desde la barra superior: idioma es/en, volumen,
silencio, modo daltónico (paleta alternativa + patrones), números grandes,
subtítulos de eventos y menos movimiento. La sala admite «tiempo ×1,5», que
multiplica **todos** los temporizadores en el servidor. Toda carta lleva silueta,
patrón y número grande: nunca solo color.

## Deploy

- **Servidor:** `packages/server/Dockerfile` (node:20-alpine, healthcheck `/hc`).
  `fly.toml` para Fly.io o `render.yaml` para Render, ambos con WSS forzado.
- **Cliente:** `vercel.json` (build estático de Vite).

## Variables de entorno

- Cliente: `VITE_WSS_URL` (por defecto `ws://localhost:2567`).
- Servidor: `PORT` (2567), `REPLAY_DIR` (`replays`).
- E2E: `E2E_BASE_URL` para apuntar el smoke a staging.

## English Summary

TOTEM is an online multiplayer card game (2-6 players) about memory, risk and
reflexes, played from a first-person table view. It is a TypeScript monorepo
built around a pure, deterministic rules engine (`core`), an authoritative
Colyseus server (`server`), a React + Three.js client (`client`), and shared
zod schemas (`protocol`). The project ships with fuzz testing, replay
verification, and a Playwright end-to-end smoke suite covering room creation
and gameplay across multiple browser tabs.
