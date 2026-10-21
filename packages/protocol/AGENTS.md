# AGENTS.md — @totem/protocol

> **Mapa estructural para agentes.** Regenerable con `/project-map`.
> Comportamiento y reglas → `../../CLAUDE.md` · Humanos/onboarding → `../../README.md`
> · Diseño y decisiones → `../../docs/02-arquitectura-tecnica.md` (§4.1, normativo)
> · Raíz del monorepo → `../../AGENTS.md`

- **Tipo:** paquete de librería (workspace) dentro del monorepo `totem`
- **Stack:** TypeScript strict + Zod
- **Estado:** fuente única de tipos cliente↔servidor, versionada (`PROTOCOL_VERSION`)

---

## 1. Mapa de directorios

```
packages/protocol/
├── src/                     [src]  esquemas y mensajes de red
│   ├── index.ts                    esquemas Zod C2S/S2C, PROTOCOL_VERSION, RateLimiter, tipos de mensaje
│   ├── codes.ts                    códigos de sala (5 letras sin ambigüedad)
│   └── protocol.test.ts             tests
├── tsconfig.json              [cfg]  extiende tsconfig.base.json
├── vitest.config.ts           [cfg]
└── package.json                [cfg]  @totem/protocol — depende de @totem/core (workspace:*) + zod
```

## 2. Arranque y comandos

- **Entrada / `main`:** `src/index.ts`
- **Build:** `pnpm --filter @totem/protocol build` (tsc)
- **Tests:** `pnpm --filter @totem/protocol test` (Vitest)

## 3. Dónde va qué (tarea → ubicación)

| Para… | Toca… |
|---|---|
| nuevo mensaje C2S o S2C | `src/index.ts` (esquema Zod) — bump `PROTOCOL_VERSION` si rompe compatibilidad |
| límites de tasa (rate limiting) | `src/index.ts` (`RateLimiter`) |
| formato de código de sala | `src/codes.ts` |
| test de un esquema | `src/protocol.test.ts` |

## 4. Capas y reglas de import

- `protocol` importa de `core` (tipos `GameEvent`, `PlayerView`) — nunca de `server` ni de `client`.
- Es la **única** fuente de tipos válidos para la frontera de red: `server` y `client` validan cada mensaje entrante/saliente contra estos esquemas Zod, nunca definen sus propios tipos de mensaje.
- Cambiar un esquema existente (no solo añadir uno nuevo) implica revisar consumidores en `packages/server/AGENTS.md` y `packages/client/AGENTS.md`, y normalmente bump de `PROTOCOL_VERSION`.
- Detalle normativo: `../../docs/02-arquitectura-tecnica.md` §4.1.

## 5. Convenciones locales de estructura

- **Naming:** mensajes C2S/S2C como uniones discriminadas Zod en `index.ts` (p.ej. `hello`, `createRoom`, `joinRoom`, `startGame`, `action`, `reconnect`, `emote`, `ping` / `lobbyState`, `joined`, `view`, `ev`, `err`, `pong`).
- **Tests:** co-ubicados (`protocol.test.ts`).
- **NO tocar:** no dupliques tipos de mensaje fuera de este paquete — cualquier tipo de red nuevo se define aquí primero.

## 6. Mapas anidados

Ninguno (paquete de un solo nivel).

## 7. Mantenimiento

Regenerable con `/project-map`. **No** metas aquí comportamiento (→ `../../CLAUDE.md`),
onboarding (→ `../../README.md`) ni rationale de diseño (→ `../../docs/02-arquitectura-tecnica.md`).
Si una ruta de este mapa deja de existir, re-ejecuta `/project-map`.
