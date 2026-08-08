# CLAUDE.md — Convenciones del repo «totem»

Juego de cartas online (2–6 jugadores) de memoria y reflejos en primera persona.
Monorepo TypeScript: lógica pura (`core`) + servidor autoritativo Colyseus (`server`)
+ cliente Three.js (`client`) + esquemas compartidos (`protocol`).

## Fuentes de verdad (léelas antes de tocar código)
- `docs/01-gdd-y-reglas-totem.md` — reglas del juego. §3–§10 son NORMATIVAS.
  Casos límite E1–E22: impleméntalos y testéalos por nombre.
- `docs/02-arquitectura-tecnica.md` — contratos técnicos. Invariantes I1–I10.
- `docs/03-plan-y-guia-agentes.md` — plan por paquetes de trabajo (WP).
- `docs/decisiones.md` — registro ADR-lite; añade una entrada si tomas una decisión
  no cubierta por los docs.
Si el código y los docs discrepan, los docs mandan: avisa, no improvises.

## Comandos
- `pnpm i` · `pnpm dev` (server+client) · `pnpm -r test` · `pnpm -r typecheck`
- `pnpm -r lint` · `pnpm sim -- --games 500` (fuzz) · `pnpm replay <file>`
Antes de dar nada por terminado: `pnpm -r typecheck && pnpm -r test` en verde.

## Reglas de oro (no negociables)
1. `packages/core` es PURO: cero IO, cero `Date.now()`, cero `Math.random()`,
   cero dependencias de runtime. El azar entra por RNG inyectado; el tiempo por
   acciones `TIMER_FIRED`.
2. Nunca expongas información oculta: ningún evento público ni `PlayerView`
   contiene valores de cartas boca abajo ni `Card.id` (invariante I2). Los eventos
   privados van solo a su destinatario.
3. Los slots vaciados NO se compactan jamás (E21).
4. TypeScript `strict`; prohibido `any`; `zod` valida toda frontera de red.
5. Toda constante de juego vive en `core/src/config.ts` (tabla de docs/01 §9).
   Nada de números mágicos.
6. No añadas dependencias sin justificarlo en el PR y en `docs/decisiones.md`.
7. No cambies firmas de `core`/`protocol` congeladas sin instrucción explícita;
   cambios de protocolo → bump de `PROTOCOL_VERSION`.
8. Usa el vocabulario canónico de los docs (fases, acciones, eventos, E*, I*).

## Definition of Done de cualquier tarea
- Tests nuevos que cubren los criterios de aceptación del WP (los casos E* con
  ficheros nombrados, p. ej. `e13_manoLlena.test.ts`).
- Typecheck, lint y tests en verde; cobertura de `core` ≥ 90 %.
- Self-review contra los invariantes I* aplicables.
- Resumen final: decisiones tomadas, deudas dejadas (TODO con WP de destino).

## Estilo
- Commits convencionales (`feat(core): …`, `fix(server): …`, `test(core): …`).
- Tests junto al código (`*.test.ts`). Comentarios solo donde el porqué no es obvio;
  referencia los casos por código (E5, I2) en vez de re-explicarlos.
- UI: strings solo vía diccionario i18n (es/en); nada hardcodeado.
