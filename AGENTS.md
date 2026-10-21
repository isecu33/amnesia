# AGENTS.md — totem

> **Mapa estructural para agentes.** Regenerable con `/project-map`.
> Comportamiento y reglas → `CLAUDE.md` · Humanos/onboarding → `README.md`
> · Diseño y decisiones → `docs/02-arquitectura-tecnica.md` (contratos técnicos) ·
> `docs/01-gdd-y-reglas-totem.md` (reglas del juego) · `docs/03-plan-y-guia-agentes.md` (plan por WP) ·
> `docs/decisiones.md` (ADR-lite)

- **Tipo:** monorepo TypeScript (pnpm workspaces, ESM) — juego de cartas online
- **Stack:** TypeScript strict · servidor Node/Express + Colyseus · cliente Vite/React + Three.js · Zod (protocolo) · Vitest (+ Playwright en cliente)
- **Estado:** MVP (fases F0–F7 del plan completadas según `README.md`, no verificado en producción)

---

## 1. Mapa de directorios

```
totem/
├── packages/               [src]  los 4 paquetes del juego (workspace) → ver §6
│   ├── core/                      motor de reglas puro → packages/core/AGENTS.md
│   ├── protocol/                   esquemas C2S/S2C compartidos → packages/protocol/AGENTS.md
│   ├── server/                      servidor Colyseus/Express → packages/server/AGENTS.md
│   └── client/                      app Vite/React/Three.js → packages/client/AGENTS.md
├── tools/sim/               [src]  fuzzer bot-vs-bot contra core (@totem/sim), sin AGENTS.md propio (un solo fichero)
├── docs/                    [doc]  GDD, arquitectura técnica, plan por WP, decisiones (ADR-lite)
│   └── archivo/             [doc]  versiones archivadas de esos mismos docs — no editar, histórico
├── .claude/                 [cfg]  agentes/comandos/skills/hooks de Claude Code para este repo
├── .github/                 [cfg]  CI (workflows/ci.yml), CODEOWNERS, dependabot, plantillas de issue/PR
├── tsconfig.base.json       [cfg]  base TS (strict, ES2022, Bundler) — todos los paquetes extienden de aquí
├── pnpm-workspace.yaml      [cfg]  globs del workspace: packages/*, tools/*
├── eslint.config.js / .prettierrc.json  [cfg]  lint y formato
├── fly.toml / render.yaml   [cfg]  deploy del servidor (Fly.io / Render, alternativas)
├── vercel.json              [cfg]  deploy del cliente estático (Vercel)
├── pnpm-lock.yaml           [gen]  lockfile — no editar a mano
├── CLAUDE.md                [doc]  reglas de comportamiento del repo para agentes
└── README.md                [doc]  onboarding humano, quickstart, tabla de comandos
```

No hay carpetas de build versionadas (`dist/`, `node_modules/`) — cada paquete las genera al compilar y quedan fuera vía `.gitignore`.

## 2. Arranque y comandos

- **Entrada / `main`:** no hay un único `main` — es un monorepo con 4 entry points: `packages/server/src/index.ts` (servidor) y `packages/client/src/main.tsx` (cliente); ver AGENTS.md de cada paquete.
- **Instalar:** `corepack enable` (o `npm i -g pnpm@9`) → `pnpm install`
- **Arrancar (dev):** `pnpm dev` (levanta servidor Colyseus en `:2567` + cliente Vite en `:5173` en paralelo vía `concurrently`)
- **Build:** `pnpm build` (= `pnpm -r build`, compila los 4 paquetes)
- **Tests:** `pnpm test` (= `pnpm -r test`, Vitest en todos los paquetes) · `pnpm --filter @totem/client e2e` (Playwright) · `pnpm --filter @totem/core test:cov` (cobertura, umbral 90%)
- **Otros:** `pnpm typecheck` (= `pnpm -r typecheck`) · `pnpm lint` / `pnpm format` · `pnpm sim -- --games 500` (fuzz de invariantes, `tools/sim`) · `pnpm replay <fichero.json>` (reproducir una partida grabada, `packages/server`)
- **Config / secretos:** no hay `.env.example` en el repo; variables documentadas en `README.md` (`VITE_WSS_URL`, `PORT`, `REPLAY_DIR`, `E2E_BASE_URL`). Deploy: `fly.toml`/`render.yaml` (servidor), `vercel.json` (cliente).

## 3. Dónde va qué (tarea → ubicación)

| Para… | Toca… |
|---|---|
| lógica de dominio pura (reglas, motor, invariantes) | `packages/core/src/` — sin IO, sin `Date.now`/`Math.random` directos (RNG inyectado) |
| esquemas/mensajes compartidos cliente↔servidor | `packages/protocol/src/index.ts` (Zod) — fuente única de tipos C2S/S2C, bump de `PROTOCOL_VERSION` si cambian |
| endpoint/handler/lógica del servidor autoritativo | `packages/server/src/` (`room.ts` = sala Colyseus, `session.ts`, `bots.ts`, `clock.ts`, `replay.ts`) |
| pantalla/render/UI del cliente | `packages/client/src/` — ver capas en `packages/client/AGENTS.md` (`net`→`state`→`presenter`→`scene`/`vfx`/`audio`→`ui`) |
| fuzzing / verificación de invariantes bot-vs-bot | `tools/sim/src/index.ts` |
| test | co-ubicado junto al código (`*.test.ts`/`*.test.tsx`), no en `__tests__/` — ver convención en §5 de cada paquete |
| reglas del juego / vocabulario canónico | consultar (no editar sin ADR) `docs/01-gdd-y-reglas-totem.md` y skill `totem-vocabulario` |
| decisión de arquitectura nueva | registrar en `docs/decisiones.md`, contrato técnico en `docs/02-arquitectura-tecnica.md` |

## 4. Capas y reglas de import

- `core` es **puro**: cero IO, cero dependencias de runtime, no importa de `protocol`, `server` ni `client`. Es la base del grafo de workspace.
- `protocol` importa de `core` (tipos `GameEvent`, `PlayerView`) pero nunca de `server` ni `client`.
- `server` y `client` importan de `core` y `protocol`; nunca al revés, y nunca se importan entre sí.
- La comunicación cliente↔servidor va **siempre** por los esquemas Zod de `protocol` (mensajes C2S/S2C) — nunca por tipos ad-hoc; el servidor siempre inyecta `p` (playerId) y `tick`, nunca confía en los del cliente.
- Grafo real de dependencias (`workspace:*`): `core` ← `protocol` ← {`server`, `client`}; `tools/sim` → `core` únicamente.
- Detalle normativo completo (§2–§4): `docs/02-arquitectura-tecnica.md`.

## 5. Convenciones locales de estructura

- **Naming:** paquetes con scope `@totem/<nombre>` (`core`, `protocol`, `server`, `client`, `sim`). Módulos en `kebab-case`/`camelCase.ts` planos dentro de cada `src/` (sin sub-index intermedios salvo el barrel `src/index.ts`).
- **Tests:** co-ubicados junto al código fuente (`<módulo>.test.ts` / `.test.tsx`), Vitest en los 4 paquetes + `tools/sim`; Playwright solo en `packages/client/e2e/`. Nota: `docs/03-plan-y-guia-agentes.md` prescribe nombrar tests de `core` por caso (`e13_manoLlena.test.ts`) pero el repo real los agrupa por tema (`effects.test.ts`, `match.test.ts`, etc.) — el árbol real prevalece sobre el doc si difieren.
- **Contenido data-driven / assets:** constantes de balance/config del juego solo en `packages/core/src/config.ts` (regla de oro del repo, ver `CLAUDE.md`).
- **NO tocar:** `docs/archivo/` (versiones archivadas, histórico); `pnpm-lock.yaml` (generado); nada bajo `../` (`amnesia/_archive/`) — no es parte de este proyecto.

## 6. Mapas anidados

- `packages/core/AGENTS.md` — motor de reglas puro del juego.
- `packages/protocol/AGENTS.md` — esquemas y mensajes compartidos cliente↔servidor.
- `packages/server/AGENTS.md` — servidor autoritativo Colyseus/Express.
- `packages/client/AGENTS.md` — app Vite/React/Three.js.
- `tools/sim/` no tiene AGENTS.md propio (un único fichero `src/index.ts`, dependencia única de `core`).

## 7. Mantenimiento

Regenerable con `/project-map`. **No** metas aquí comportamiento (→ `CLAUDE.md`),
onboarding (→ `README.md`) ni rationale de diseño (→ `docs/02-arquitectura-tecnica.md`,
`docs/decisiones.md`). Si una ruta de este mapa deja de existir, el mapa está
desactualizado: re-ejecuta `/project-map`.
