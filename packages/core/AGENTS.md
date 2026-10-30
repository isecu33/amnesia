# AGENTS.md — @totem/core

> **Mapa estructural para agentes.** Regenerable con `/project-map`.
> Comportamiento y reglas → `../../CLAUDE.md` · Humanos/onboarding → `../../README.md`
> · Diseño y decisiones → `../../docs/02-arquitectura-tecnica.md`
> · Raíz del monorepo → `../../AGENTS.md`

- **Tipo:** paquete de librería pura (workspace) dentro del monorepo `totem`
- **Stack:** TypeScript strict, cero dependencias de runtime
- **Estado:** API pública congelada (motor de reglas)

---

## 1. Mapa de directorios

```
packages/core/
├── src/                     [src]  motor de reglas del juego (plano, sin subcarpetas)
│   ├── index.ts                    barrel export — API pública
│   ├── engine.ts                   createGame / apply / setController
│   ├── types.ts                    tipos del dominio
│   ├── config.ts                   ÚNICA fuente de constantes/balance del juego
│   ├── deck.ts / rng.ts             mazo y RNG inyectado (nunca Math.random directo)
│   ├── rules.ts / legal.ts          reglas y acciones legales (objetivos de efecto, presagio vigente)
│   ├── effects.ts / fail.ts         resolución de objetivos de efecto y errores de regla compartidos
│   ├── score.ts                    puntuación
│   ├── view.ts                     vista por jugador (oculta info no visible)
│   └── *.test.ts                    tests co-ubicados (ver §5)
├── tsconfig.json / tsconfig.build.json  [cfg]  build extiende tsconfig.base.json de la raíz
├── vitest.config.ts          [cfg]  cobertura v8, umbral 90% (líneas/funciones/statements/branches)
└── package.json              [cfg]  @totem/core — sin deps de runtime
```

## 2. Arranque y comandos

- **Entrada / `main`:** `src/index.ts` (barrel export; también usado directo por otros paquetes del workspace vía `workspace:*`, sin build intermedio)
- **Instalar:** desde la raíz, `pnpm install` (workspace único)
- **Build:** `pnpm --filter @totem/core build` (tsc -p tsconfig.build.json → `dist/`)
- **Tests:** `pnpm --filter @totem/core test` (Vitest) · `pnpm --filter @totem/core test:cov` (con cobertura, umbral 90%)
- **Config:** ninguna en runtime — todas las constantes de balance viven en `src/config.ts`

## 3. Dónde va qué (tarea → ubicación)

| Para… | Toca… |
|---|---|
| nueva regla o fase del juego | `src/rules.ts` (+ `src/legal.ts` si cambia qué acciones son legales) |
| motor / flujo de aplicación de eventos | `src/engine.ts` (`apply`, `createGame`) |
| constante o parámetro de balance | `src/config.ts` — nunca hardcodear en otro fichero |
| tipo del dominio | `src/types.ts` |
| qué ve cada jugador (info oculta) | `src/view.ts` |
| puntuación | `src/score.ts` |
| test de una regla/caso del GDD | co-ubicado en `src/`, ver convención en §5 |

## 4. Capas y reglas de import

- `core` no importa de ningún otro paquete del workspace (`protocol`, `server`, `client`) — es la base del grafo.
- Cero IO: nada de `fetch`, `fs`, `Date.now()` ni `Math.random()` directos dentro de `src/` — el RNG se inyecta (`rng.ts`).
- API pública (`createGame`, `apply`, `viewFor`, `legalActions`, `applyEventToView` — exportadas desde `index.ts`) está **congelada**: cambiarla exige coordinarse con `protocol` (posible bump de `PROTOCOL_VERSION`) y con los consumidores (`server`, `client`, `tools/sim`).

## 5. Convenciones locales de estructura

- **Naming:** ficheros planos en `src/`, un módulo por responsabilidad (`deck.ts`, `rng.ts`, `rules.ts`, …).
- **Tests:** co-ubicados como `<tema>.test.ts` (p.ej. `effects.test.ts`, `match.test.ts`, `round.test.ts`, `setup.test.ts`, `turn.test.ts`, `view.test.ts`, `invariants.test.ts`) + `test-helpers.ts` compartido. `docs/03-plan-y-guia-agentes.md` prescribe nombrar por caso del GDD (`e13_manoLlena.test.ts`); el repo real no sigue ese patrón — al escribir un test nuevo, sigue la convención por tema ya existente en el árbol, no la del doc.
- **Property-based testing:** `fast-check` (devDependency solo aquí) integrado dentro de los mismos `*.test.ts`, usado para los invariantes I1–I9 (ver `docs/02-arquitectura-tecnica.md`).
- **NO tocar:** no rompas la API pública de `index.ts` sin revisar primero `packages/protocol/AGENTS.md` y `packages/server/AGENTS.md`/`packages/client/AGENTS.md` (consumidores).

## 6. Mapas anidados

Ninguno (paquete de un solo nivel).

## 7. Mantenimiento

Regenerable con `/project-map`. **No** metas aquí comportamiento (→ `../../CLAUDE.md`),
onboarding (→ `../../README.md`) ni rationale de diseño (→ `../../docs/02-arquitectura-tecnica.md`).
Si una ruta de este mapa deja de existir, re-ejecuta `/project-map`.
