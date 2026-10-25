# 03 — Plan de Implementación con Agentes de Código y Guía de Dirección

> **Cómo usar este documento:** es tu manual de operaciones. Cada Paquete de Trabajo (WP) = una sesión de agente = un PR. Los docs 01 y 02 son los insumos que le pasas al agente; este doc te dice qué pedir, en qué orden, con qué prompt y cómo saber si está bien.

---

## 1. Filosofía de trabajo con agentes (léela antes de empezar)

1. **Contrato antes que código.** Los docs 01 y 02 se cierran primero (léelos tú, ajusta los parámetros que quieras en la tabla de config). Congelas la API de `core` y `protocol` al terminar F1–F2. A partir de ahí, cambiar una regla = editar el doc 01 primero → pedir al agente «sincroniza core con docs/01 §X según este changelog».
2. **Un WP por conversación y por PR.** Contexto pequeño = agente preciso. No mezcles «arregla esto y de paso añade aquello».
3. **Los tests son la moneda.** Ningún PR sin tests nuevos que cubran sus criterios de aceptación. Pide siempre al agente ejecutar `pnpm -r typecheck && pnpm -r test` y pegar la salida.
4. **Plan antes de código en WPs grandes.** Primera instrucción: «dame el plan en ≤ 10 líneas y espera mi OK».
5. **Vocabulario canónico.** Usa siempre los nombres de acciones/eventos/fases/casos (E1–E22, I1–I10) de los docs. Si el agente inventa sinónimos, corrígelo en el momento: la deriva de nombres es el bug silencioso nº 1 en proyectos con agentes.
6. **Gate de diversión.** No se toca el 3D (F4) hasta haber jugado el gray-box (F3) con al menos 2 humanos + 2 bots y haber ajustado la config. Si el gray-box no engancha, el 3D no lo va a arreglar.

---

## 2. Preparación del repo (antes del primer WP)

1. Crea el repo `totem` y copia dentro: `docs/01…`, `docs/02…`, `docs/03…` y `CLAUDE.md` en la raíz (fichero entregado aparte).
2. Crea `docs/decisiones.md` vacío con la plantilla ADR-lite: `## D-001 · fecha · decisión · por qué · alternativas descartadas`.
3. Activa branch protection en `main`: CI verde obligatorio.
4. Herramienta recomendada: **Claude Code** (terminal o app de escritorio) apuntando a la raíz del repo — lee `CLAUDE.md` automáticamente. Cualquier otro agente de código sirve si le pegas el mismo prompt.

---

## 3. Fases y dependencias

| Fase | Contenido | WPs | Sesiones est.* | Depende de |
|---|---|---|---|---|
| F0 | Andamiaje del monorepo + CI | 00 | 1–2 | — |
| F1 | Motor de reglas `core` completo y testeado | 01–04 | 6–10 | F0 |
| F2 | Protocolo + servidor autoritativo + bots | 05–07 | 5–8 | F1 |
| F3 | **Gray-box jugable** (UI fea funcional) + gate de diversión | 08 | 2–4 | F2 |
| F4 | Escena 3D primera persona + animación core | 09–10 | 5–8 | F3 |
| F5 | VFX de efectos + HUD diegético + audio | 11–12 | 4–7 | F4 |
| F6 | Meta: salas, tutorial, ajustes, arte final | 13–14 | 5–8 | F5 |
| F7 | Accesibilidad + i18n + deploy + playtest/balance | 15–17 | 4–6 | F6 |

\* «Sesión» = una conversación de agente enfocada (0,5–2 h de tu atención). Total realista: **35–55 sesiones, 4–7 semanas a tiempo parcial.** El orden F1→F2→F3 es estricto; dentro de F4–F5 hay paralelismo posible si usas dos agentes en ramas distintas.

---

## 4. Plantilla de prompt (úsala en TODOS los WPs)

```
ROL: Eres un ingeniero senior de TypeScript trabajando en el repo "totem".
CONTEXTO OBLIGATORIO: Lee CLAUDE.md y las secciones indicadas de docs/01 y docs/02
antes de escribir nada.

OBJETIVO: <1–3 frases: qué existe al terminar que hoy no existe>

ALCANCE (haz): <lista corta y concreta>
FUERA DE ALCANCE (no hagas): <lo que NO debe tocar: otros paquetes, deps nuevas, reglas>

INTERFACES QUE DEBES RESPETAR: <firmas/archivos exactos de docs/02, o "las ya existentes">

CRITERIOS DE ACEPTACIÓN:
- [ ] <verificable 1, idealmente un comando y su resultado esperado>
- [ ] <…>
- [ ] `pnpm -r typecheck && pnpm -r test` en verde, salida pegada.

PROCESO: 1) plan en ≤10 líneas y espera mi OK; 2) implementa; 3) ejecuta los comandos;
4) self-review contra invariantes I1–I10 y casos E aplicables; 5) resumen: decisiones
tomadas, deudas dejadas, y entrada para docs/decisiones.md si procede.
```

---

## 5. Paquetes de trabajo (WP-00 … WP-17)

Formato: objetivo · entradas (qué docs pasar/citar) · criterios de aceptación (CA). Los WP-00, WP-01 y WP-11 incluyen además el **prompt completo listo para pegar** (§6) como modelo del nivel de detalle a usar en el resto.

**WP-00 · Andamiaje.** Monorepo pnpm con los 4 paquetes vacíos pero compilables, tsconfig strict, ESLint+Prettier, vitest configurado, CI de GitHub Actions, scripts raíz de doc 02 §2. *Entradas:* 02 §2. *CA:* `pnpm i && pnpm -r typecheck && pnpm -r test && pnpm -r lint` verde en local y en CI; README con quickstart < 5 min.

**WP-01 · core, parte 1: setup + turno básico.** Tipos de 02 §3.2–3.5, `config.ts` con la tabla completa de 01 §9, `createGame`, mazo de 01 §2, reparto, vislumbre inicial, y el ciclo robar→descartar/sustituir SIN efectos, timers de turno (E15), rotación y órbitas. *Entradas:* 01 §2–§4, §9; 02 §3. *CA:* tests unitarios de cada paso del turno; E1, E2, E15 testeados por nombre; I1 e I3 como property tests ya activos; cobertura core ≥ 90 %.

**WP-02 · core, parte 2: efectos.** Vislumbre, Espionaje, Trueque Ciego con targeting, timeout, omitir, sellados y validaciones. *Entradas:* 01 §5; casos E8–E12. *CA:* un test por efecto feliz + uno por cada caso E8–E12; eventos `EFFECT_*` y `PRIVATE_REVEAL` exactamente como 02 §3.5; I6 property test.

**WP-03 · core, parte 3: Descarte Rápido.** Match, castigo, bloqueo, arbitraje por ticks, cadenas, mano llena. *Entradas:* 01 §6; E4–E7, E13, E20, E21. *CA:* tests nombrados por caso E; test de cadena (dos matches seguidos válidos); test de arbitraje (dos intentos mismo tick-window → 1 OK + 1 REJECTED sin castigo; intento tardío → FAIL con castigo); I5 e I8 property tests.

**WP-04 · core, parte 4: ÚLTIMA, puntuación, rondas y vistas.** Cantar/sellar, fin de ronda por 3 vías, `score()`, modos Rápida/Clásico, `legalActions`, `viewFor`, `applyEventToView`. *Entradas:* 01 §7–§8; E3, E6, E10, E16–E19; 02 §3.6. *CA:* tests de las 3 vías de fin; puntuación del cantor (gana/empata/pierde); **I2 como test dedicado**: serializar vistas de una partida completa y grep de valores ocultos e ids; I4, I7, I9; fuzz local `pnpm sim -- --games 500` sin violaciones (I10 reducido). **Al aprobar este WP: API de core CONGELADA.**

**WP-05 · protocol.** Esquemas zod C2S/S2C de 02 §4.1, `PROTOCOL_VERSION`, tipos compartidos exportados. *CA:* tests de parseo válido/ inválido por mensaje; rechazo de payload > 2 KB; import limpio desde server y client.

**WP-06 · server, parte 1: sala autoritativa.** Room Colyseus: lobby, asientos, códigos de sala, arranque, bucle acción→apply→difusión pública/privada, timers centralizados. *Entradas:* 02 §4.2. *CA:* test de integración @colyseus/testing: 3 clientes juegan una ronda scriptada completa y sus vistas finales coinciden con `viewFor`; los eventos privados solo llegan a su destinatario (aserción explícita).

**WP-07 · server, parte 2: arbitraje, reconexión, bots, replays.** Cola de match con ticks, tokens de reconexión + asiento bot (E9, E16, E18), RandomBot y GreedyBot, volcado de replays y comando `pnpm replay`. *CA:* test: 2 `MATCH_ATTEMPT` encolados → resultados E5 correctos; test de reconexión (cliente cae, bot juega 1 turno, humano vuelve y recibe snapshot); 100 partidas bot-vs-bot vía servidor real terminan limpias; un replay re-simulado reproduce el estado final byte a byte.

**WP-08 · Gray-box (F3).** Cliente mínimo FEO a propósito: HTML/DOM o canvas 2D — botones y rectángulos — conectado al servidor real. Home/lobby/mesa/puntuación funcionales. Sin Three.js, sin animaciones. *Entradas:* 02 §5.4 (flujo de pantallas), vista y `legal`. *CA:* dos pestañas + 2 bots completan una partida Clásico a 100 real; la UI solo habilita lo que dice `view.legal`; deploy temporal (localhost + túnel) suficiente para playtest. **→ GATE: juega aquí con amigos y ajusta config antes de continuar.**

**WP-09 · Escena 3D base.** Mesa, cámara primera persona con idle, tótems propios en arco inferior, rivales alrededor, mazo/descarte, iluminación y postproceso, materiales toon, paleta 01 §12, placeholders CC0. Estático pero renderizando el estado real de una partida. *Entradas:* 01 §11–12; 02 §5.3. *CA:* `pnpm dev` muestra una partida en curso legible; 60 fps y ≤ 80 draw calls (pegar medición); tus 8 slots (con huecos) siempre visibles según requisito duro de 01 §11.

**WP-10 · Interacción + cola de animación.** Raycaster/intents, cola FIFO + presenter GSAP, timelines de robar/descartar/sustituir/turnos con las duraciones de 01 §11, fast-forward de cola larga. *Entradas:* 02 §5.2; tabla 01 §11. *CA:* partida completa jugable en 3D contra bots; con lag simulado de 2 s las animaciones se ven enteras y en orden; reconexión hace fast-forward + snapshot sin romper la escena.

**WP-11 · VFX de efectos + match + ÚLTIMA.** Las 6 secuencias vistosas (vislumbre, espionaje con cuervo, trueque con humo, match OK/FAIL, campana de ÚLTIMA, revelación en oleada) + hooks de audio con SFX placeholder. *Prompt completo en §6.3.*

**WP-12 · HUD diegético.** Vela-reloj, marcador tallado, placas de jugador, rueda de emotes, log de subtítulos de eventos. *CA:* partida entera sin necesitar texto flotante no diegético salvo el log; emotes con rate-limit; capturas adjuntas.

**WP-13 · Meta.** Home con nombre/avatar, crear/unirse por código, lobby con bots y config de sala (expone la tabla 01 §9 con rangos válidos), pantalla de puntuación entre rondas, fin de partida y revancha. *CA:* flujo completo sin tocar la URL; config inválida imposible desde UI y rechazada por servidor.

**WP-14 · Tutorial + pulido indie.** Tutorial guiado de 6 pasos (guion en 01 §11) contra bot scriptado; pase de shaders/partículas/grano; música y SFX definitivos o CC0 curados. *CA:* un tester nuevo termina el tutorial < 4 min sin ayuda; checklist de juice: toda acción de la tabla 01 §11 tiene su animación+sonido.

**WP-15 · Accesibilidad + i18n.** Requisitos duros de 01 §11: daltónico, tiempo ×1,5, subtítulos, números grandes; extracción es/en completa. *CA:* partida completa jugable en cada modo; cero strings hardcodeados (lint rule o grep en CI).

**WP-16 · Deploy + E2E.** Dockerfile, Fly.io/Render + Vercel, WSS, healthcheck, smoke Playwright contra staging en CI. *CA:* URL pública funcionando; partida real de 3 humanos por internet sin desync; replay de esa partida verificado.

**WP-18 · Vista «mesa con personajes» + estilo pixel-3D (D-042).** Rehacer la presentación según `docs/05` (aprobado) y `docs/01` §11–12: `layout.ts` con herradura, poses de cámara y anclajes de personaje; marionetas low-poly de 6 animales totémicos generadas por código; cámara «mesa»/«mis tótems» + giro ±30°; render a ~360 px con *nearest* y paleta cerrada; HUD 2D (barra de slots, estado, temporizador, acciones con tecla); mapa como descriptor (solo el nocturno con velas). Solo `packages/client`; `core` y `protocol` intactos. *Entradas:* 01 §11–12; 02 §5.3; 05. *CA:* tests de layout (tus 4–8 slots visibles en ambas poses para 2–6 jugadores), de la barra 2D (nunca valores fuera de la vista privada), de anclajes/poses de personajes y regresión I2 (la carta de un rival siempre por el dorso); ≤ 80 draw calls y 60 fps en portátil medidos con `?stats=1`; capturas a 2, 4 y 6 jugadores, en ambas poses y en móvil horizontal 812×375.

**WP-17 · Playtest y balance.** Sesiones guiadas, telemetría de 02 §8 revisada, ajustes SOLO vía tabla de config (doc 01 §9 actualizado primero), lista de bugs → replays → tests de regresión. *CA:* 5 partidas seguidas con grupos distintos sin bug bloqueante; decisiones de balance registradas en `docs/decisiones.md`.

---

## 6. Prompts completos de ejemplo (copia, pega, ajusta)

### 6.1 WP-00 — Andamiaje

```
ROL: Eres un ingeniero senior de TypeScript. Vas a crear desde cero el monorepo del
juego "totem".
CONTEXTO OBLIGATORIO: Lee CLAUDE.md y docs/02-arquitectura-tecnica.md §2 (estructura,
herramientas y scripts). No leas todavía el resto.

OBJETIVO: Dejar un monorepo pnpm compilable, testeable y con CI, con los paquetes
core, protocol, server y client vacíos pero enlazados.

ALCANCE (haz):
- pnpm workspaces con packages/{core,protocol,server,client} y tools/sim.
- tsconfig.base.json con strict:true, noUncheckedIndexedAccess:true; cada paquete
  extiende de él. Prohibido "any" (regla ESLint error).
- ESLint + Prettier unificados; vitest configurado en core/protocol/server;
  Vite + React + Three.js instalados en client con una página "hola mesa".
- Scripts raíz exactos de docs/02 §2 (dev, -r test, -r typecheck, -r lint, sim, replay
  — sim y replay pueden ser stubs que fallan con "not implemented").
- .github/workflows/ci.yml: lint + typecheck + test + build client en cada PR.
- README raíz: quickstart de menos de 5 minutos.
FUERA DE ALCANCE: cualquier lógica de juego, cualquier dependencia no listada en
docs/02 §2, tocar los docs.

CRITERIOS DE ACEPTACIÓN:
- [ ] `pnpm i && pnpm -r typecheck && pnpm -r test && pnpm -r lint` verde (pega salida).
- [ ] `pnpm dev` levanta client (página placeholder) y server (log "listening").
- [ ] CI verde en un PR de prueba.
- [ ] Un test dummy por paquete demuestra que vitest corre en cada uno.

PROCESO: plan en ≤10 líneas y espera mi OK; luego implementa; ejecuta comandos;
resumen final con cualquier decisión tomada para docs/decisiones.md.
```

### 6.2 WP-01 — core, parte 1

```
ROL: Eres un ingeniero senior de TypeScript especializado en motores de juego
deterministas. Trabajas SOLO dentro de packages/core.
CONTEXTO OBLIGATORIO: Lee CLAUDE.md; docs/01 §2 (mazo), §3 (preparación), §4 (turno),
§9 (tabla de config completa) y los casos E1, E2, E15, E21; docs/02 §3 entero
(tipos, API, acciones, eventos, invariantes I1–I4).

OBJETIVO: Motor de reglas jugable en su ciclo básico: crear partida, repartir,
vislumbre inicial, y turnos completos de robar→descartar/sustituir, SIN efectos,
SIN match, SIN ÚLTIMA (llegan en WPs siguientes).

ALCANCE (haz):
- types.ts, config.ts (TODAS las claves de docs/01 §9 con defecto y validación de
  rango), rng.ts (mulberry32 + contador en estado, docs/02 §3.7).
- createGame: mazo exacto de docs/01 §2 (52 cartas, ids "c00".."c51"), Fisher-Yates
  con la semilla, reparto de initialSlots, primera carta al descarte (E1: sin efecto),
  fase INITIAL_PEEK.
- apply para: PEEK_INITIAL, DRAW_DECK, DRAW_DISCARD, DISCARD_DRAWN (si la carta tiene
  efecto, por ahora emite DISCARDED_DRAWN con effect y termina el turno SIN
  targeting — deja un TODO(WP-02) explícito), SWAP_DRAWN, TIMER_FIRED('peek'|'turn'),
  START_ROUND. Eventos exactamente con la forma de docs/02 §3.5.
- legalActions coherente con lo implementado. Rotación de turnos y contador de órbitas.
- E15: timeout de turno = DRAW_DECK + DISCARD_DRAWN automáticos sin efecto.
- E21: huecos representados como null, jamás compactar (aunque en este WP aún no se
  vacían slots, el tipo y las utilidades ya deben asumirlo).
FUERA DE ALCANCE: efectos con targeting, MATCH_ATTEMPT, CALL_ULTIMA, viewFor,
puntuación, cualquier otro paquete, dependencias nuevas (core = cero deps runtime).

INTERFACES QUE DEBES RESPETAR: firmas literales de docs/02 §3.3–3.5. Si algo te parece
ambiguo, pregunta ANTES de desviarte; no "mejores" la API por tu cuenta.

CRITERIOS DE ACEPTACIÓN:
- [ ] Tests unitarios: mazo (composición exacta por valor), reparto, vislumbre con
      autocompletado (autoPeekAtSecond vía TIMER_FIRED), robar de mazo y de descarte,
      descartar, sustituir, rotación y órbitas.
- [ ] Tests nombrados e1_*.test.ts, e2_*.test.ts, e15_*.test.ts.
- [ ] Property tests (fast-check): I1 (conservación=52) e I3 (apply nunca lanza y
      no muta el estado ante acciones aleatorias, legales o no) sobre secuencias de
      200 acciones.
- [ ] Determinismo: misma (config, players, seed, acciones) dos veces →
      JSON.stringify(estado) idéntico.
- [ ] Cobertura de core ≥ 90 % líneas (pega el reporte).
- [ ] `pnpm -r typecheck && pnpm -r test` verde (pega salida).

PROCESO: plan en ≤10 líneas y espera mi OK. Al terminar: self-review contra I1–I4,
lista de TODOs dejados para WP-02..04, y propuesta de entrada para docs/decisiones.md
si tomaste alguna decisión no cubierta por los docs.
```

### 6.3 WP-11 — VFX (ejemplo de cómo especificar trabajo visual, que es lo más difícil de encargar)

```
ROL: Eres un ingeniero de gráficos/tech-artist en Three.js + GSAP. Trabajas SOLO en
packages/client (vfx/, presenter/, audio/).
CONTEXTO OBLIGATORIO: CLAUDE.md; docs/01 §11 (tabla de feedback con duraciones y
descripciones) y §12 (paleta, estilo); docs/02 §5.2 (cola de animación) y §5.3.

OBJETIVO: Las 6 secuencias de efecto renderizando sobre la escena existente:
Vislumbre, Espionaje (cuervo espectral + viñeta), Trueque (humo), Match OK,
Match FAIL (con revelación pública de 2 s y carta de castigo), campana de ÚLTIMA con
sellado, y la revelación final en oleada.

ALCANCE (haz):
- Una timeline GSAP por evento, registrada en el presenter, duraciones de la tabla
  de docs/01 §11 (±30 % si lo justificas).
- Partículas con puntos/sprites propios (sin libs nuevas); humo y chispas con
  shaders simples o texturas generadas.
- El cuervo puede ser un cono estilizado con alas planas: silueta > detalle.
- Hooks de audio: un stub playSfx(id) por secuencia con SFX placeholder CC0.
- Escena de depuración `pnpm dev --scene=vfx`: botones que disparan cada secuencia
  con datos falsos, sin servidor. (Así reviso yo tu trabajo en 2 minutos.)
FUERA DE ALCANCE: red, reglas, HUD, assets finales, postproceso global (ya existe).

CRITERIOS DE ACEPTACIÓN:
- [ ] La escena de depuración muestra las 7 secuencias correctamente aisladas.
- [ ] En partida real contra bots, cada evento dispara su secuencia vía la cola,
      sin solaparse y sin que el estado visual se adelante (probar con lag 2 s).
- [ ] PRIVATE_REVEAL muestra el valor SOLO en mi pantalla, exactamente ttlMs, y no
      deja rastro en DOM/estado después (I2 en el cliente).
- [ ] 60 fps sostenidos con la secuencia más cara en bucle; draw calls ≤ 80 (medición).
- [ ] `pnpm -r typecheck && pnpm -r test` verde.

PROCESO: plan + boceto textual de cada secuencia (3 líneas c/u) y espera mi OK.
```

---

## 7. Guía de dirección: revisar, desatascar, corregir

**Tu checklist de revisión de cada PR (10 min, en este orden):**
1. ¿Los tests nuevos prueban literalmente los criterios de aceptación, o prueban trivialidades? Lee los tests antes que el código.
2. `grep -rn "any" packages/` y `grep -rn "TODO" packages/` — todo TODO debe llevar su WP de destino.
3. En cualquier WP que toque vistas o eventos: busca fugas — ¿algún evento público lleva `value` o `id` de carta boca abajo? (I2).
4. ¿Inventó nombres nuevos para conceptos que ya tienen nombre canónico? Pídele renombrar.
5. Ejecuta tú `pnpm -r test` y, desde WP-08, juega 2 minutos.

**Cuando el agente se atasca o alucina:**
- Trocea: convierte el WP en a/b/c («solo tipos y tests que fallan», luego «hazlos pasar»).
- Pide diagnóstico antes de más código: «explica tu hipótesis del fallo y propón 3 opciones con pros/contras; no toques nada aún».
- Si alucina APIs (p. ej. de Colyseus o Three.js): «verifica esa API contra el paquete instalado en node_modules antes de usarla y cita el fichero .d.ts».
- Si un WP lleva > 2 sesiones sin verde, revierte la rama y reencárgalo con alcance menor: es más barato que arrastrar medio-código.

**Ritual de cierre de cada WP:** el agente entrega (a) salida de tests, (b) self-review contra I/E aplicables, (c) deudas con destino, (d) entrada para `docs/decisiones.md` si procede. Tú fusionas, actualizas tu tablero (una lista simple WP-00..17 con ✅ vale), y abres la siguiente conversación limpia.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación ya incorporada |
|---|---|
| Carrera del Descarte Rápido produce estados corruptos | Arbitraje por ticks en core (E5/E7) + tests dedicados en WP-03/07; single-thread por sala |
| La UI se desincroniza del servidor | Cola de animación + snapshot de resync (02 §5.2); Playwright con lag simulado |
| Alguien lee valores ocultos (trampa) | I2 como property test + eventos privados dirigidos + sin ids públicos (02 §6) |
| El agente rompe contratos entre paquetes | API congelada tras WP-04, zod en fronteras, CI obligatorio, PROTOCOL_VERSION |
| Scope creep de arte | Placeholders CC0 obligatorios hasta F6; WP-11 con escena de depuración revisable |
| El juego no es divertido | Gate F3: playtest en gray-box; todo el balance vive en la tabla de config, ajustable sin código |
| Reinventar netcode | Colyseus para salas/reconexión; prohibido WebRTC/rollback casero en MVP |

---

## 9. Checklist «listo para jugar con amigos» (fin de F5/F6)

- [ ] Crear sala, compartir código por WhatsApp, 4 personas dentro en < 1 min
- [ ] Partida Clásico a 100 completa sin desync ni bug bloqueante
- [ ] Las 3 mecánicas de efecto + match + ÚLTIMA con su animación y sonido
- [ ] Bots rellenan huecos y sustituyen desconexiones (y no se nota demasiado)
- [ ] Reconexión en < 10 s recupera la partida
- [ ] Tutorial completable por alguien que no ha leído nada
- [ ] Corre a 60 fps en un portátil normal y en un móvil de gama media (aunque móvil sea «bonus»)
- [ ] Replay de cada partida guardado y verificable con `pnpm replay`
