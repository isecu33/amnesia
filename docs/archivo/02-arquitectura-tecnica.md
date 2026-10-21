# 02 — Arquitectura Técnica de «TÓTEM»

> **Estado:** v1.0 — Fuente de verdad técnica. Los contratos marcados **NORMATIVO** se congelan al final de la fase F1/F2 (doc 03): cambiarlos exige actualizar este doc y subir la versión de protocolo.

---

## 1. ADR-001: Elección de stack

**Estado:** Aceptada · **Contexto:** el juego lo van a construir agentes de código dirigidos por una persona; el requisito nº 1 del proyecto es que los agentes puedan trabajar con máxima autonomía y verificabilidad. El juego es de cámara fija (mesa en primera persona), lógica por turnos + un evento en tiempo real (Descarte Rápido), 2–6 jugadores por sala, y debe ser trivial que un grupo de amigos entre a jugar.

| Dimensión | A) Web TS: Three.js + Colyseus | B) Godot 4 | C) Unity + Netcode |
|---|---|---|---|
| Aptitud para agentes | **Excelente**: todo es texto, un solo lenguaje, tests ejecutables por CLI | Buena: GDScript y escenas .tscn son texto, pero el flujo depende del editor | Mala: proyecto semi-binario, licencias, APIs de red inestables |
| Distribución a amigos | **Un link** (crítico para juego de grupo) | Export web posible pero multiplayer web con fricción | Build por plataforma, WebGL pesado |
| Netcode de salas | Colyseus lo resuelve (salas, estado, reconexión) | API high-level propia, montar relay/servidor manual | Netcode for GameObjects + relay de pago |
| Primera persona con «juice» | Suficiente: cámara fija, escena pequeña, shaders y partículas manuales | **Mejor**: motor completo | Mejor |
| Testing de la lógica | **Vitest + property testing puro** | GUT (más limitado) | Test runner pesado |
| Coste/licencias | 0 (open source) | 0 | Riesgo de licencia |

**Decisión:** Opción A — **monorepo TypeScript**: lógica pura compartida + servidor autoritativo Node/Colyseus + cliente Three.js. La escena es una habitación con una mesa y ~40 objetos: Three.js sobra, y todo lo demás juega a favor del flujo con agentes.

**Consecuencias:** (+) los agentes pueden verificar su propio trabajo con `pnpm test`; (+) el juego core es una librería determinista testeable al 100 %; (+) amigos entran por URL. (−) Sin editor visual: la composición de la escena se hace por código (aceptable con cámara fija); (−) físicas/3D avanzado manual (no lo necesitamos).

**Plan B documentado:** si a mitad de F4 la presentación en Three.js resultase insufrible, `core` y `protocol` se conservan tal cual y solo se reescribe el cliente en Godot 4 (cliente WebSocket contra el mismo servidor). Esta portabilidad es otra razón para el diseño «lógica pura + servidor autoritativo».

---

## 2. Monorepo (NORMATIVO)

```
totem/
├── CLAUDE.md                  # convenciones para agentes (fichero aparte, ya redactado)
├── package.json               # pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json         # strict: true, sin excepciones
├── .github/workflows/ci.yml   # lint + typecheck + test + build en cada PR
├── docs/
│   ├── 01-gdd-y-reglas-totem.md
│   ├── 02-arquitectura-tecnica.md
│   ├── 03-plan-y-guia-agentes.md
│   └── decisiones.md          # ADR-lite: una entrada por decisión no trivial
├── packages/
│   ├── core/                  # LÓGICA PURA. Cero dependencias de runtime. Cero IO.
│   │   └── src/{types,config,engine,legal,view,rng,score}.ts + *.test.ts
│   ├── protocol/              # esquemas zod de mensajes C2S/S2C + versión
│   ├── server/                # Node + Colyseus: salas, timers, arbitraje, bots
│   │   └── src/{index,room,timers,bots,codes,replay}.ts
│   └── client/                # Vite + Three.js + React (solo overlay HUD)
│       └── src/{net,state,scene,presenter,vfx,audio,ui}/
└── tools/
    └── sim/                   # fuzzing: N partidas bot-vs-bot contra core
```

**Herramientas:** pnpm, TypeScript `strict`, Vite, Three.js, `colyseus` + `@colyseus/testing`, `zod`, `vitest`, `fast-check`, `playwright`, GSAP (animación), `zustand` (estado cliente), ESLint + Prettier, GitHub Actions.

**Scripts raíz estandarizados (los agentes los usan siempre):** `pnpm dev` (server+client), `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm sim -- --games 1000`, `pnpm replay <file>`.

---

## 3. `packages/core` — el motor de reglas (NORMATIVO)

### 3.1 Principios
1. **Funciones puras e inmutables.** Nada de IO, `Date.now()`, `Math.random()` ni timers dentro de core. El azar entra por RNG inyectado; el tiempo entra como acciones `TIMER_FIRED` que dispara el servidor.
2. **Determinismo total:** `(config, playerIds, seed, [acciones]) → mismo estado final`. Esto hace que cada partida grabada sea un test de regresión gratis (ver §7 Replays).
3. **El servidor es la única autoridad.** El cliente solo emite intenciones.

### 3.2 Tipos núcleo (extracto normativo)

```ts
// packages/core/src/types.ts
export type CardValue = 0|1|2|3|4|5|6|7|8|9|10|11|12|13;
export interface Card { id: string; value: CardValue }        // ids "c00".."c51", solo servidor
export type Slot = Card | null;                                // null = hueco (E21: no compactar)
export type Phase =
  | 'INITIAL_PEEK' | 'TURN_DRAW' | 'TURN_RESOLVE'
  | 'EFFECT_TARGETING' | 'ROUND_REVEAL' | 'ROUND_END' | 'GAME_END';

export interface PlayerCore {
  id: string; slots: Slot[];
  roundScore: number; totalScore: number;
  sealed: boolean;                    // cantor de ÚLTIMA
  matchLockedUntilTick?: number;      // bloqueo de 5 s tras fallo
}

export interface GameState {
  config: GameConfig; seed: number; rngCounter: number;
  deck: Card[]; discard: Card[];      // discard[último] = carta superior
  players: PlayerCore[]; turnOrder: string[]; activeIdx: number;
  orbit: number; phase: Phase;
  drawn?: { card: Card; source: 'deck'|'discard' };
  pendingEffect?: 'PEEK'|'SPY'|'SWAP';
  ultimaCaller?: string; turnsLeftAfterUltima?: number;
  reshuffles: number; tick: number;   // tick = contador monótono asignado por el servidor
  lastDiscardChangeTick: number;      // ancla del arbitraje E5/E7
}
```

### 3.3 API pública (NORMATIVO — congelar al cerrar F1)

```ts
export function createGame(config: GameConfig, playerIds: string[], seed: number): GameState;
export function legalActions(s: GameState, playerId: string): Action[];
export function apply(s: GameState, a: Action): Result;   // nunca lanza
export type Result =
  | { ok: true;  state: GameState; events: GameEvent[] }
  | { ok: false; error: RuleError };                       // estado original intacto
export function viewFor(s: GameState, playerId: string): PlayerView;   // filtra TODO lo oculto
export function applyEventToView(v: PlayerView, e: GameEvent): PlayerView; // el cliente no piensa
```

### 3.4 Acciones (union completa, NORMATIVO)

```ts
export type Action =
  | { t:'PEEK_INITIAL';   p: string; slots: number[] }               // hasta initialPeekCount
  | { t:'CALL_ULTIMA';    p: string }
  | { t:'DRAW_DECK';      p: string }
  | { t:'DRAW_DISCARD';   p: string }
  | { t:'DISCARD_DRAWN';  p: string }
  | { t:'SWAP_DRAWN';     p: string; slot: number }
  | { t:'EFFECT_TARGET';  p: string; target: EffectTarget }
  | { t:'EFFECT_SKIP';    p: string }
  | { t:'MATCH_ATTEMPT';  p: string; slot: number; tick: number }    // tick de recepción (servidor)
  | { t:'TIMER_FIRED';    timer: 'peek'|'turn'|'effect'|'reveal' }   // solo servidor
  | { t:'START_ROUND' } | { t:'FORFEIT'; p: string };                // solo servidor

export type EffectTarget =
  | { kind:'PEEK'; slot: number }
  | { kind:'SPY';  player: string; slot: number }
  | { kind:'SWAP'; ownSlot: number; player: string; theirSlot: number };
```

### 3.5 Eventos (union completa, NORMATIVO)

Los eventos marcados **(privado)** solo se envían al jugador indicado; el resto son públicos. Regla de oro: **ningún evento público contiene valores de cartas boca abajo ni ids de carta** — solo posiciones de slot (ver §6 Seguridad).

```ts
export type GameEvent =
  | { e:'ROUND_STARTED'; order: string[]; discardTop: CardValue; startingPlayer: string }
  | { e:'INITIAL_PEEK_RESULT'; to: string; cards: {slot:number; value:CardValue}[] } // (privado)
  | { e:'TURN_STARTED'; player: string; orbit: number; deadlineTick: number }
  | { e:'ULTIMA_CALLED'; player: string }
  | { e:'DREW'; player: string; source:'deck'|'discard' }                      // sin valor
  | { e:'DREW_VALUE'; to: string; value: CardValue }                           // (privado, ladrón)
  | { e:'DISCARDED_DRAWN'; player: string; value: CardValue; effect?: 'PEEK'|'SPY'|'SWAP' }
  | { e:'SWAPPED_DRAWN'; player: string; slot: number; discardedValue: CardValue }
  | { e:'EFFECT_PENDING'; player: string; effect: 'PEEK'|'SPY'|'SWAP'; deadlineTick: number }
  | { e:'EFFECT_RESOLVED'; player: string; effect: string;
      publicInfo: { slots: {player:string; slot:number}[] } }                  // qué slots, no valores
  | { e:'PRIVATE_REVEAL'; to: string; player: string; slot: number; value: CardValue; ttlMs: number } // (privado)
  | { e:'EFFECT_SKIPPED'; player: string; reason:'timeout'|'chosen'|'noTargets' }
  | { e:'MATCH_OK';   player: string; slot: number; value: CardValue }
  | { e:'MATCH_FAIL'; player: string; slot: number; value: CardValue; penalty:'card'|'points' }
  | { e:'MATCH_REJECTED'; player: string; reason:'tooLate'|'window'|'locked' } // sin castigo
  | { e:'PENALTY_CARD'; player: string; slot: number }                         // sin valor
  | { e:'DECK_RESHUFFLED'; deckCount: number }
  | { e:'ROUND_REVEAL'; hands: Record<string,(CardValue|null)[]> }
  | { e:'ROUND_SCORED'; scores: Record<string,{round:number; total:number}>; ultimaSuccess?: boolean }
  | { e:'GAME_ENDED'; winner: string; totals: Record<string,number> }
  | { e:'PLAYER_SEAT'; player: string; controller:'human'|'bot' };
```

### 3.6 Vista filtrada del jugador

```ts
export interface PlayerView {
  you: { id:string; slots:('hidden'|'empty')[]; sealed:boolean; lockedForMs:number };
  others: { id:string; name?:string; slots:('hidden'|'empty')[]; sealed:boolean; controller:'human'|'bot' }[];
  discardTop?: CardValue; deckCount: number;
  phase: Phase; activePlayer: string; orbit: number;
  drawn?: { source:'deck'|'discard'; value?: CardValue }; // value solo si eres el ladrón
  timers: { kind:string; deadlineTick:number }[];
  scores: Record<string,{round?:number; total:number}>;
  legal: Action['t'][];   // la UI habilita botones SOLO con esto
}
```

Nota: los `PRIVATE_REVEAL` no persisten en la vista — se emiten, el cliente los muestra `ttlMs` y los olvida. En reconexión (E18) no se reenvían.

### 3.7 Determinismo y RNG
- RNG contador: `mulberry32(hash(seed, rngCounter))`; `rngCounter` vive en el estado y se incrementa por uso → serializable y reproducible.
- Barajado: Fisher-Yates. Rebarajado (E3): mismo RNG, siguiente contador.
- Los castigos roban del mazo ya barajado (sin RNG extra).

### 3.8 Invariantes (I1–I10) — base de los property tests

1. **I1 Conservación:** `|deck| + |discard| + Σ slots ocupados + (drawn?1:0) = 52` en todo estado alcanzable.
2. **I2 Cero fugas:** `JSON.stringify(viewFor(s,p))` nunca contiene el valor de un slot boca abajo (propio o ajeno) ni ningún `Card.id`.
3. **I3** `apply` nunca lanza; ante acción ilegal devuelve `{ok:false}` y el estado (por referencia y por valor) queda intacto.
4. **I4 Coherencia:** toda acción de `legalActions(s,p)` es aceptada por `apply`, y toda acción aceptada estaba en `legalActions` (excepto acciones de servidor).
5. **I5** Tras `MATCH_FAIL` con castigo `card`, la mano del infractor crece exactamente en 1; con `points`, `roundScore` crece exactamente `fullHandPenaltyPoints`.
6. **I6** Un jugador `sealed` jamás aparece como objetivo en un `EFFECT_RESOLVED` ni emite `MATCH_*`.
7. **I7** `GAME_END` es absorbente: ninguna acción lo modifica.
8. **I8** Los índices de slot nunca se reordenan ni compactan (E21).
9. **I9** Puntuaciones de `ROUND_SCORED` = recomputables desde `ROUND_REVEAL` + reglas §8 (función `score()` pura verificable).
10. **I10 Fuzz:** 10 000 partidas con bots aleatorios terminan en < 5 000 acciones cada una sin violar I1–I9.

---

## 4. `packages/protocol` + `packages/server`

### 4.1 Mensajería (NORMATIVO, validada con zod en ambos extremos)

`PROTOCOL_VERSION = 1`. Cualquier cambio de forma → bump + entrada en `docs/decisiones.md`.

**Cliente → Servidor:** `hello {name, avatar, protocolVersion}` · `createRoom {config?}` · `joinRoom {code}` · `startGame` · `action {a: Action}` (envoltorio único de todas las acciones de core; el servidor añade `p` y `tick` — **nunca** se confía en los del cliente) · `reconnect {token}` · `emote {id}` · `ping`.

**Servidor → Cliente:** `lobbyState {code, seats, config, canStart}` · `joined {playerId, token}` · `view {v: PlayerView}` (snapshot: al entrar, reconectar o ante desincronización) · `ev {e: GameEvent, tick}` (flujo incremental; el cliente lo pliega con `applyEventToView`) · `err {code, msg}` · `pong`.

### 4.2 Sala Colyseus `totem_room`
- **Ciclo:** LOBBY (2–6 asientos, host configura y arranca) → partida (una instancia de `GameState` de core) → fin → sala expira (TTL 2 h).
- **Códigos de sala:** 5 letras sin ambiguas (sin O/0/I/1/L).
- **Autoridad:** cada mensaje `action` → validar zod → inyectar `p` y `tick` (contador de sala) → `apply` → si `ok`, difundir eventos (públicos con `broadcast`, privados con `client.send`); si no, `err` solo al emisor.
- **Timers:** el servidor programa `setTimeout` según `deadlineTick` de los eventos y dispara `TIMER_FIRED` como una acción más. Un solo lugar (módulo `timers.ts`).
- **Arbitraje del match (E5/E7):** Node procesa por orden de llegada dentro de la sala (single-thread), así que «primero en llegar» = orden natural. Core compara `action.tick` contra `lastDiscardChangeTick` para decidir `MATCH_OK/FAIL` vs `MATCH_REJECTED(tooLate)` dentro de la ventana de `matchArbitrationMs` (convertida a ticks).
- **Reconexión:** token uuid → asiento reservado `reconnectGraceSeconds`; después `PLAYER_SEAT{bot}`; al volver, snapshot `view` + `PLAYER_SEAT{human}`.
- **Bots:** `interface Bot { decide(v: PlayerView, legal: Action[]): Action }`. `RandomBot` (uniforme sobre legales, nunca canta ÚLTIMA); `GreedyBot` (memoriza sus vislumbres en un mapa slot→valor; sustituye si `drawn.value` < valor recordado o < 6.5 esperado en slots desconocidos; hace match solo sobre valores que recuerda; canta si su suma estimada < 7). Retardo humanizado `botTurnDelayMsMin..Max`.
- **Límites:** 10 msg/s por cliente; `MATCH_ATTEMPT` máx. 1/s; payloads > 2 KB rechazados.

---

## 5. `packages/client`

### 5.1 Capas
`net` (WebSocket + fold de eventos) → `state` (zustand: `PlayerView` + cola de animación) → `presenter` → `scene`/`vfx`/`audio` → `ui` (React solo para HUD/menús).

### 5.2 La cola de animación (patrón clave)
Los eventos del servidor **no** tocan la escena directamente: entran en una cola FIFO. El `presenter` los consume de uno en uno ejecutando una timeline GSAP por tipo de evento (duraciones de la tabla del doc 01 §11); la vista lógica local se actualiza cuando su animación **empieza**. Resultado: aunque el servidor vaya por delante, el drama se ve entero y en orden. Si la cola supera 8 eventos (reconexión, lag), se colapsa a un «fast-forward» + snapshot.

### 5.3 Escena Three.js
- **Nodos:** `TableRoot` (mesa redonda) · `DeckPile` / `DiscardPile` (centro) · `PlayerRig × N` (fila de hasta 8 `TotemMesh` con pooling, placa de nombre billboard, vela-reloj) · `CameraRig` (posición del asiento propio + ruido Perlin sutil; leve *lean* hacia el objetivo durante Espionaje) · luces: 1 direccional cálida + ambiente tenue + point lights de vela con flicker.
- **Materiales:** `MeshToonMaterial` + gradient map de 3 bandas; `OutlinePass` para interactuables; `EffectComposer`: Bloom(0.3) + Vignette + FilmGrain (paleta y valores del doc 01 §12).
- **Input:** raycaster sobre meshes con `userData.intent` (`'slot'|'deck'|'discard'|'bell'`…). El input genera **intenciones**; se envían solo si su tipo está en `view.legal`.
- **Presupuesto:** 60 fps en portátil medio; ≤ 80 draw calls; texturas en atlas ≤ 2048; GLB total < 15 MB.
- **Assets mínimos (lista para F4):** mesa, tótem (1 modelo, 14 texturas de cara), dorso, vela, campana, entorno (skybox + 4 props), 12 SFX, 2 loops de música. Placeholders CC0 hasta F6 (doc 01 §12).

### 5.4 Pantallas
`Home` (nombre + crear/unirse con código) → `Lobby` (asientos, bots, config, «empezar») → `Mesa` (el juego) → `Puntuación` (entre rondas) → `Fin`. Ajustes accesibles siempre: volumen, daltónico, tiempo ×1,5, idioma es/en (i18n por diccionario JSON desde el día 1).

---

## 6. Seguridad y paridad de información

Principio rector: **el cliente solo recibe lo que un humano sentado a la mesa vería con sus ojos.**
1. Los valores ocultos jamás viajan (I2). Filtrado en `viewFor` + eventos privados dirigidos.
2. Los eventos públicos referencian **slots**, nunca `Card.id`: si los ids fueran públicos, un cliente modificado podría rastrear cartas a través de trueques automáticamente — arruinaría el pilar «memoria frágil».
3. Todo mensaje entrante pasa por zod; `p` y `tick` los pone el servidor.
4. Semilla secreta; solo se publica al final de la partida (verificabilidad).
5. Rate limiting (§4.2). Sin datos personales: nombre efímero + token de sesión.

---

## 7. Testing, observabilidad y CI

| Capa | Herramienta | Qué se exige |
|---|---|---|
| core unit | vitest | Cada regla y cada caso E1–E22 con test nombrado (`e13_manoLlena.test.ts`…). Cobertura ≥ 90 % líneas en `core`. |
| core property | fast-check | I1–I9 sobre secuencias de acciones legales aleatorias |
| fuzz | `tools/sim` | I10: 10 000 partidas bot; en CI nightly, 500 en cada PR |
| server integración | @colyseus/testing | 3 clientes scriptados juegan una ronda completa; test de reconexión; test de arbitraje con 2 matches encolados |
| cliente E2E | playwright | Smoke: crear sala, 2 pestañas, jugar 2 turnos scriptados, aserciones sobre la vista |
| **Replays** | `pnpm replay` | Cada partida del servidor guarda `{seed, config, acciones+ticks}` (JSON). El comando re-simula con core y verifica estado final → **cada bug de producción se convierte en un test de regresión adjuntando su replay.** |

CI (GitHub Actions) en cada PR: `lint` + `typecheck` + `test` + `build` cliente + `docker build` servidor. PR rojo = no se fusiona, sin excepciones.

---

## 8. Deploy

- **Servidor:** Dockerfile `node:20-alpine`, 1 proceso, salas en memoria (sin BD en MVP). Fly.io o Render, 1 región cercana a los jugadores, WSS obligatorio, healthcheck `/hc`, logs `pino` JSON.
- **Cliente:** build estático de Vite en Vercel/Netlify (o zip para itch.io). `VITE_WSS_URL` por entorno.
- **Entornos:** `dev` local (`pnpm dev` levanta ambos) · `staging` (rama main) · `prod` (tag).
- **Telemetría MVP:** contador de partidas, duración media, ratio de aciertos de match, frecuencia de ÚLTIMA exitosa — a logs; nada de terceros.

## 9. Qué revisitar cuando crezca
Persistencia de cuentas/ranking (BD), escalado multi-proceso de Colyseus (presence Redis), matchmaking público, moderación de nombres, cliente Godot si el 3D pide más músculo (Plan B §1).
