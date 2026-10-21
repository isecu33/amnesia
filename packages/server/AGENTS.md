# AGENTS.md — @totem/server

> **Mapa estructural para agentes.** Regenerable con `/project-map`.
> Comportamiento y reglas → `../../CLAUDE.md` · Humanos/onboarding → `../../README.md`
> · Diseño y decisiones → `../../docs/02-arquitectura-tecnica.md` (§4.2, normativo)
> · Raíz del monorepo → `../../AGENTS.md`

- **Tipo:** servidor autoritativo (Express + Colyseus) dentro del monorepo `totem`
- **Stack:** TypeScript strict, Node ≥20, Colyseus, Express, pino, tsx (dev)
- **Estado:** MVP, deploy vía Docker a Fly.io/Render

---

## 1. Mapa de directorios

```
packages/server/
├── src/                     [src]  todo el código del servidor (plano, sin subcarpetas rooms/schemas)
│   ├── index.ts                    arranque Express + Colyseus Server, define la room "totem_room"
│   ├── room.ts                     TotemRoom — sala Colyseus autoritativa (ciclo de vida, arbitraje por ticks)
│   ├── session.ts                  gestión de sesión/reconexión (token uuid + asiento bot)
│   ├── bots.ts                     RandomBot / GreedyBot
│   ├── clock.ts                    temporización (sustituye al `timers.ts` que documenta el plan original — ver nota)
│   ├── codes.ts                    generación/validación de códigos de sala
│   ├── replay.ts / replay-cli.ts    grabación y CLI de reproducción de partidas
│   ├── telemetry.ts                telemetría
│   └── *.test.ts                    tests co-ubicados (ver §5)
├── Dockerfile                [cfg]  node:20-alpine, deploy Fly.io/Render
├── tsconfig.json              [cfg]  extiende tsconfig.base.json
├── vitest.config.ts           [cfg]  pool threads singleThread, timeouts largos (Colyseus)
└── package.json                [cfg]  @totem/server — depende de @totem/core y @totem/protocol (workspace:*)
```

**Nota:** `../../docs/02-arquitectura-tecnica.md` §2 documenta `server/src/timers.ts` como fichero previsto; en el árbol real esa lógica vive repartida entre `room.ts` y `clock.ts`. Guíate por el árbol real, no por el doc, para localizar código.

## 2. Arranque y comandos

- **Entrada / `main`:** `src/index.ts`
- **Dev:** `pnpm --filter @totem/server dev` (tsx watch, o `pnpm dev` desde la raíz junto al cliente) — puerto `:2567`
- **Build:** `pnpm --filter @totem/server build` (tsc)
- **Start (prod):** `pnpm --filter @totem/server start` (tsx)
- **Tests:** `pnpm --filter @totem/server test` (Vitest)
- **Replay:** `pnpm replay <fichero.json>` (= `pnpm --filter @totem/server replay`, usa `replay-cli.ts`)
- **Config:** variables documentadas en `../../README.md` (`PORT`, `REPLAY_DIR`) — sin `.env.example` en el repo. Deploy: `../../fly.toml`, `../../render.yaml`, `Dockerfile` propio.

## 3. Dónde va qué (tarea → ubicación)

| Para… | Toca… |
|---|---|
| ciclo de vida de la sala / reglas de arbitraje | `src/room.ts` |
| reconexión / sesión de jugador | `src/session.ts` |
| comportamiento de bot | `src/bots.ts` |
| temporización de turnos/fases | `src/clock.ts` (y `src/room.ts`) |
| formato/generación de código de sala | `src/codes.ts` |
| grabación o reproducción de partidas | `src/replay.ts` / `src/replay-cli.ts` |
| telemetría | `src/telemetry.ts` |
| arranque HTTP/WS, registro de la room | `src/index.ts` |
| test de servidor | co-ubicado en `src/`, ver `e2e.test.ts`, `room.test.ts`, `session.test.ts`, `lasthuman.test.ts`, `telemetry.test.ts` |

## 4. Capas y reglas de import

- `server` importa de `core` (motor de reglas) y `protocol` (validación de mensajes) — nunca de `client`.
- Toda entrada de red se valida contra los esquemas de `protocol` antes de tocar el estado del juego; el servidor **siempre** inyecta `p` (playerId) y `tick` en los eventos salientes, nunca confía en valores del cliente.
- La sala Colyseus (`room.ts`) es la única autoridad sobre el estado de partida — el cliente nunca decide reglas, solo reenvía intención (acciones) vía `protocol`.
- Detalle normativo: `../../docs/02-arquitectura-tecnica.md` §4.2.

## 5. Convenciones locales de estructura

- **Naming:** ficheros planos en `src/`, un módulo por responsabilidad.
- **Tests:** co-ubicados como `<tema>.test.ts` (`e2e.test.ts`, `lasthuman.test.ts`, `room.test.ts`, `session.test.ts`, `telemetry.test.ts`). Integración vía `@colyseus/testing` según `../../docs/02-arquitectura-tecnica.md` §7.
- **NO tocar:** `Dockerfile` sin coordinar con `../../fly.toml`/`../../render.yaml` (deploy); no reintroducir estado no autoritativo — cualquier decisión de reglas pasa por `core`, no se reimplementa aquí.

## 6. Mapas anidados

Ninguno (paquete de un solo nivel, sin subcarpetas).

## 7. Mantenimiento

Regenerable con `/project-map`. **No** metas aquí comportamiento (→ `../../CLAUDE.md`),
onboarding (→ `../../README.md`) ni rationale de diseño (→ `../../docs/02-arquitectura-tecnica.md`).
Si una ruta de este mapa deja de existir, re-ejecuta `/project-map`.
