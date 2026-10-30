# Registro de decisiones (ADR-lite)

Plantilla: `## D-00X · fecha · decisión · por qué · alternativas descartadas`

## D-001 · 2026-08-03 · `mode` entra en `GameConfig`
Los modos «Ronda rápida» y «Clásico a 100» son normativos (docs/01 §8) pero no
aparecían en la tabla de config de §9. Se añade `mode: 'quick' | 'classic'`
(defecto `classic`) a `GameConfig` para que todo el balance siga viviendo en un
único sitio. *Alternativa descartada:* pasar el modo por fuera de la config, que
habría roto la regla de oro nº 5.

## D-002 · 2026-08-03 · 1 tick = 1 milisegundo
`GameState.tick` se define como el reloj monótono del servidor en ms. Así
`matchArbitrationMs` (E5) y los `deadlineTick` de los eventos son directamente
comparables sin conversiones. *Alternativa descartada:* ticks abstractos con
factor de conversión, que exigía duplicar la unidad en servidor y cliente.

## D-003 · 2026-08-03 · el servidor inyecta `tick` en TODAS las acciones
docs/02 §4.1 dice que el servidor añade `p` y `tick` al envoltorio `action`; la
unión de acciones solo lo declaraba en `MATCH_ATTEMPT`. Se modela como
`Action = ActionBody & { tick?: number }`: las formas literales del doc no
cambian y el tiempo sigue entrando en `core` únicamente desde fuera. El tick
queda en el log de acciones, así que los replays siguen siendo deterministas.

## D-004 · 2026-08-03 · campos de bookkeeping en `GameState`
El extracto de docs/02 §3.2 es normativo pero no exhaustivo. Se añaden
`peekChoices`, `peekAutoCompleted`, `firstMatchAttemptTick`, `timers`,
`roundStarter`, `round`, `emptyAltarWinner`, `winner` y `PlayerCore.controller` /
`penaltyPoints`. Ninguno cambia una firma congelada.

## D-005 · 2026-08-03 · `MATCH_ATTEMPT` es una acción firmada por el servidor
Lleva el tick de recepción, así que se clasifica junto a `TIMER_FIRED`,
`START_ROUND` y `FORFEIT` y queda exenta de la igualdad estricta de I4. Esto
permite que un intento en ventana cerrada (E20) o durante el bloqueo devuelva
`ok:true` con `MATCH_REJECTED` —el «feedback sin castigo» que pide docs/01 §6—
en vez de un error seco. `legalActions` la sigue listando para que la UI pueda
habilitar los tótems.

## D-006 · 2026-08-03 · la comparación de ÚLTIMA usa la puntuación de ronda
docs/01 §8 dice «si su suma es estrictamente la más baja». Se compara la suma de
tótems **más** los puntos de castigo acumulados (E4/E13), porque es lo que el
jugador anota realmente en la ronda. *Alternativa descartada:* comparar solo
tótems, que premiaría a quien acumuló castigos.

## D-007 · 2026-08-03 · `setController` como añadido a la API de `core`
`FORFEIT` cubre «un bot toma el asiento» (E16), pero no el camino de vuelta al
reconectar (E18). Se exporta `setController(s, pid, controller): Result`, aditivo
y sin tocar ninguna firma congelada.

## D-008 · 2026-08-03 · la superior del descarte queda «desconocida» tras `DRAW_DISCARD`
El evento `DREW` no lleva valor, así que plegando eventos el cliente no puede
saber qué carta queda al descubierto bajo la que se ha llevado el ladrón.
`applyEventToView` marca `discardTop` como desconocida y el servidor manda un
snapshot `view` inmediatamente después. *Alternativa descartada:* añadir el valor
al evento `DREW`, que habría cambiado un contrato normativo.

## D-009 · 2026-08-03 · `Bot.observe(event)` y RandomBot sin Descarte Rápido
`Bot` gana `observe(e)` porque GreedyBot necesita memorizar sus vislumbres
privados igual que un humano. RandomBot, además de no cantar ÚLTIMA, tampoco
lanza Descartes Rápidos: hacerlo a ciegas degenera las partidas de prueba en
cadenas de castigos y ensucia el fuzz.

## D-010 · 2026-08-03 · snapshot `view` tras cada cambio (solo MVP)
Para el gray-box (F3) el servidor manda un snapshot a cada jugador después de
cada acción, además del flujo de eventos. Cuesta poco con ≤ 6 jugadores y
elimina toda clase de desincronización mientras la cola de animación no existe.
**Deuda:** en WP-10, con la cola de animación real, limitar los snapshots a los
casos de docs/02 §4.1 (entrar, reconectar, desincronización).

## D-011 · 2026-08-03 · `hello` responde con `joined`
Los mensajes enviados dentro de `onJoin` se pierden si el cliente aún no ha
registrado sus manejadores. `hello` —que docs/02 §4.1 ya define como primer
mensaje del cliente— devuelve `{playerId, token, protocolVersion}`, así que es el
cliente quien controla el momento.

## D-012 · 2026-08-03 · la generación de códigos de sala vive en `protocol`
El cliente necesita generar el código al crear la sala para que
`filterBy(['code'])` de Colyseus funcione al unirse. `makeRoomCode` /
`isValidRoomCode` se comparten desde `@totem/protocol`.

## D-013 · 2026-08-08 · el presenter es puro y la escena solo obedece
La cola de animación (`presenter/queue.ts`) y la tabla de tiempos
(`presenter/timelines.ts`) no importan Three.js ni GSAP: reciben hooks. Así el
ritmo del juego —lo más fácil de romper sin darse cuenta— se testea sin WebGL.
GSAP y Three.js viven solo en `scene/` y `vfx/`.

## D-014 · 2026-08-08 · assets generados por código en vez de CC0 descargados
Las caras de los tótems, el dorso y las placas se dibujan en `<canvas>`; los SFX
se sintetizan con WebAudio (`audio/audio.ts`). El repo no depende de descargas
externas y arranca con `pnpm dev` sin más. Sigue siendo placeholder: el arte y el
audio finales entran en F6 según docs/01 §12.

## D-015 · 2026-08-08 · `Bot` de accesibilidad: `reducedMotion` corta los VFX
El requisito duro de docs/01 §11 habla de tiempo ×1,5, daltónico, subtítulos y
números grandes. Se añade «menos movimiento», que desactiva la oscilación de
cámara y las secuencias VFX manteniendo el estado del juego intacto. Es una
extensión, no una sustitución de los requisitos del doc.

## D-016 · 2026-08-08 · el tutorial corre contra `core` en local, sin servidor
`tutorial/engine.ts` crea su propia `GameState` con semilla fija y guiona los 6
pasos de docs/01 §11. Ventajas: es determinista, se testea entero y funciona sin
conexión. *Alternativa descartada:* un modo tutorial en el servidor, que habría
metido reglas de guion dentro de la sala autoritativa.

## D-017 · 2026-08-08 · `rematch` como mensaje nuevo del protocolo
La revancha (docs/03 WP-13) necesita reiniciar la partida conservando asientos.
Se añade `rematch` a C2S. Al ser un mensaje nuevo y no un cambio de forma de uno
existente, `PROTOCOL_VERSION` se mantiene en 1: los clientes viejos siguen
funcionando, simplemente no piden revancha.

## D-018 · 2026-08-08 · el `tick` del servidor viaja en la vista
`PlayerView.tick` permite al cliente calcular cuánto queda de un `deadlineTick`
sin sincronizar relojes. La vela-reloj lo usa midiendo el desfase con el reloj
local desde el último snapshot.

## D-019 · 2026-08-08 · el cierre por abandono (E16) es decisión de sala, no de `core`
Cuando solo queda un humano frente a bots, el servidor le ofrece terminar con
victoria. `core` no tiene ninguna acción para «acabar la partida ahora» y su API
está congelada, así que la sesión marca `forcedEnd`, para los temporizadores y
difunde `GAME_ENDED` con los totales vigentes. El motor queda intacto y sigue
siendo reproducible desde el log de acciones. *Alternativa descartada:* añadir
una acción `CONCEDE` a la unión congelada, que habría obligado a subir
`PROTOCOL_VERSION` y a revisar I4 e I7.

## D-020 · 2026-08-08 · el asiento se registra ANTES de reconectar
`TotemRoom.onJoin` busca el asiento por token, registra la conexión y solo
entonces llama a `session.reconnect`. Al revés —como estaba— el snapshot `view`
se enviaba a una conexión que aún no existía en el mapa y se perdía: el cliente
volvía a la sala sin estado. Lo destapó el test de integración de reconexión.

## D-021 · 2026-08-08 · viñeta y grano en una sola pasada
`GrainVignetteShader` combina los dos efectos de docs/02 §5.3 en un `ShaderPass`
en vez de encadenar dos. Una pasada menos en el composer, mismo resultado
visual. Bloom (0,3) y `OutlinePass` sí van aparte porque necesitan sus propios
render targets. Si `EffectComposer` falla al crearse, la escena cae a render
directo y el resaltado vuelve a `emissive`: la partida nunca se queda sin jugar.

## D-022 · 2026-08-08 · ambiente y música sintetizados, con dos intensidades
Grillos (pulsos agudos con jitter) y fuego (ruido marrón filtrado) sobre un bus
propio; la música es un arpegio de 4–5 notas que cambia de escala, timbre y
tempo al pasar a `tense`. `ULTIMA_CALLED` sube la intensidad y `ROUND_STARTED`
la devuelve a `calm`, como pide docs/01 §12. Sigue siendo placeholder hasta F6.

## D-042 · 2026-10-21 · vista «mesa con personajes» y estilo pixel-3D
Se aprueba `docs/05-direccion-vista.md` con las recomendaciones de su §4 (D-040 y
D-041 ya están citadas en código, por eso se salta al 042). Cambia `docs/01`
§11–12: primera persona sentado a una mesa con los rivales como **marionetas
rígidas low-poly** (animales totémicos originales, sin skinning) repartidos en
**herradura** (φ ∈ [100°, 260°]) para que quepan en pantalla con 2–6 jugadores;
cámara con **dos poses** («mesa» y «mis tótems», Space/botón/arrastre) más giro
lateral ±30° que vuelve al centro; **HUD 2D en esquinas** + **barra inferior de
slots** que nunca muestra valores salvo durante la vista privada de 3 s (E18 y
el pilar de memoria); manos propias solo durante tus acciones; la carta que
sostiene un rival se pinta siempre por el dorso (I2, E22). Estilo «Megabonk»:
texturas canvas diminutas con `NearestFilter` y sin mipmaps, render interno a
~360 px de alto escalado sin suavizado, paleta cerrada de 32 colores aplicada en
postproceso con tramado ordenado; el grano de película se elimina (con 360 px
era ruido que parpadeaba). El **mapa** pasa a ser un descriptor de datos
(`scene/maps/`); hoy solo existe el nocturno con velas. Todo es cosmético:
`core` y `protocol` no cambian. *Alternativas descartadas:* giro libre 360°
(mareo, se pierden los tótems de vista), círculo completo de asientos (a 6
jugadores los vecinos caen fuera de pantalla), personajes con skinning o GLB
descargados (rompe D-014 y el presupuesto de draw calls), mostrar en la barra
2D los valores ya vistos (rompería el juego de memoria), `OutlinePass` para el
resaltado (re-renderiza la escena: duplica las draw calls; se sustituye por un
marco instanciado bajo cada objeto legal).

## D-043 · 2026-10-25 · Robo de efecto (Amnesia v2)
Nueva regla base. Al descartar con C1 un tótem con efecto se abre, **antes** de
`EFFECT_TARGETING`, una **ventana de robo** de `stealWindowMs` (1500 por defecto,
rango 1000–2500, **configurable por sala**) con el Descarte Rápido abierto. Un
rival que acierta un match sobre esa carta **roba el efecto**: hace el match
normal (hueco E21, cuenta para Cadena sin bonus propio) y ejecuta el efecto con
sus propios 10 s y objetivos; el dueño lo pierde (transferencia, no copia). Si
nadie roba, el dueño entra en `EFFECT_TARGETING` como hoy. Un solo robo por
carta: el primer intento válido gana (E5, 300 ms); los aciertos posteriores son
matches normales sin efecto. Excepción deliberada a «los efectos nunca se
activan en Descarte Rápido» (§5) y a «`EFFECT_TARGETING` cierra el Descarte
Rápido» (la ventana va antes del targeting, no durante). Evento público
`EFFECT_STOLEN`; los resultados privados (Vislumbre/Espionaje) solo los ve el
ladrón. Casos límite E23–E28 en la redacción del GDD v2. *Alternativas
descartadas:* copia del efecto (los dos lo usan: demasiado poder), ventana
durante el targeting (los objetivos desaparecerían a mitad de selección), robo
encadenable (inflaría las reglas).

## D-044 · 2026-10-26 · mapas de v1 y su elección por sala
v1 trae **5 mapas**: nocturno con velas (por defecto), cueva helada, templo en la
selva, marisma con niebla y cañón de tótems. Los elige el **anfitrión** como
opción de sala (con «aleatorio»); fijo durante la partida, solo cambia entre
partidas en el lobby. Enmienda a D-042 y §12: el `protocol` **sí** transporta
un `mapId` como opción cosmética de sala; `core` lo ignora y ningún mapa toca
las reglas. Forma y material de la mesa libres por mapa siempre que los asientos
queden a distancia parecida (misma herradura y requisito de visibilidad). Cada
paleta (24–32 colores) mantiene fijos marfil de cartas, místico, peligro y luz
de vela. Audio propio por mapa (ambiente, instrumentación de la música y foley
de mesa); los leitmotivs de efecto son comunes. *Alternativas descartadas:*
elección local por jugador (cada uno vería una mesa distinta), votación
(fricción en el lobby para algo cosmético), mapas que alteran reglas (la
variedad de reglas ya vive en las opciones de sala), leitmotivs por mapa
(perderían su función de reconocer el efecto).

## D-045 · 2026-10-26 · elenco de personajes, animación básica y reacciones
Se mantiene el elenco de **6 animales** (búho, zorro, oso, ciervo, serpiente,
cuervo); el oso no es carta del mazo a propósito (el personaje no sugiere un
efecto). El jugador **elige su animal en la sala**, uno por sala y sin
duplicados: el ocupado se ve no disponible y no hay reasignación silenciosa
(`assignSpecies` queda como respaldo para bots y sesiones antiguas). Sin poses
por especie: el catálogo de 11 poses es común y los eventos de v2 (Robo de
efecto, Revuelo, Trueque Vidente, presagios, cadena) las reutilizan; el mapeo
evento→pose lo cierra el WP. Al jugar carta, `reach`/`toss`/`slap` ganan un
pequeño «peso» (rebote de la carta, retirada de la mano con retardo), sin
bloquear ni retrasar el Descarte Rápido (recortable por el `presenter`). En
reposo, todos los animales parpadean (3–6 s aleatorio, párpado que escala en Y
~120 ms) y miran al jugador activo o al mazo; al girar la cámara local los
rivales parpadean y siguen con la mirada. «Reducir movimiento» lo apaga todo.
**Reacciones:** los 6 ids de `emote` se mantienen, pero se muestran como
**iconos pixel propios del juego** (saludo, risa, sospecha, tristeza, susto,
aplauso/estrella tótem) dibujados en código con la paleta fija de la UI, iguales
para todos; el personaje no se mueve. Sobre el personaje ~1,2 s, enfriamiento
2 s por jugador, sin tapar la fila de tótems; motivos sonoros actuales. Sin
cambio de protocolo. *Alternativas descartadas:* poses por especie (coste de
arte), reacciones como gestos del personaje (se pidió solo iconos), glifos de
texto (no son del juego).

## D-046 · 2026-10-29 · reglas v2: parejas de efectos separadas y Chamán activo
Implementación de #4/#13. `effectOf`: 7 Vislumbre, 8 Doble Robo, 9 Espionaje,
10 Ojo Compartido, 11 Trueque Ciego, 12 Revuelo, 13 Trueque Vidente (el 0–6 sigue
sin efecto). `EffectKind` y `EffectTarget` crecen con `SHARED_EYE`, `RUMBLE`,
`SEER_LOOK` y `SEER_SWAP`. La resolución vive en `core/src/effects.ts`
(`resolveTarget`, `reduceEffect`) y los errores compartidos en `fail.ts`; `engine.ts`
solo orquesta el flujo de turno. Ojo Compartido se reduce a Vislumbre sin rival
válido y a Espionaje sin slot propio (el `EFFECT_PENDING` anuncia el efecto ya
reducido). Revuelo admite propio↔rival, rival↔rival y dos slots del mismo rival;
dos propios o el mismo slot dos veces son ilegales (`SWAP_SELF`, `SAME_SLOT`).
«Pasar» sigue siendo `EFFECT_SKIP`/`EFFECT_SKIPPED(chosen)` en todos los efectos.
*Alternativas descartadas:* un solo `EFFECT_TARGET` genérico con listas de casillas
(perdería la validación por tipo de efecto).

## D-047 · 2026-10-29 · Trueque Vidente: dos pasos dentro de `EFFECT_TARGETING`
El Chamán no añade fases: `EFFECT_TARGETING` con `effectStep` 1 (mirar,
`SEER_LOOK`) y 2 (trueque opcional, `SEER_SWAP`). Cada paso arma su propio reloj
`effect`; `EFFECT_PENDING` lleva `step`. Expirar el 1.º pierde todo el efecto;
expirar el 2.º, solo el trueque (`EFFECT_SKIPPED(timeout)`). Sin rival válido el
paso 1 solo ofrece tótems propios y no hay paso 2. El Descarte Rápido sigue
cerrado en ambos pasos, de modo que el caso «E6 durante el paso 2» de #13 no puede
darse (queda cubierto como rechazo `window`). `PlayerView.effect` expone
`{kind, owner, step}` sin valores.

## D-048 · 2026-10-29 · Doble Robo: marcador por jugador y elección con `DOUBLE_DRAW_KEEP`
El 8 no abre fase de efecto: `PlayerCore.doubleDrawPending` (no acumulable, E30) y
evento público `DOUBLE_DRAW_PENDING` (marcador sobre el altar). En el siguiente
`DRAW_DECK` se roban 2 (solo 1 si el mazo se queda sin cartas, E31; con el mazo
vacío se rebaraja antes, E3): `GameState.drawnChoice` con ambas, evento privado
`DOUBLE_DREW_VALUES` y nueva acción `DOUBLE_DRAW_KEEP {index}`; la rechazada va al
descarte boca arriba con `DOUBLE_DRAW_REJECTED`, sin efecto (E32), y abre carrera.
**«Pasar»** = `EFFECT_SKIP` en `TURN_DRAW` mientras hay marcador (`passed`).
Se pierde (`DOUBLE_DRAW_CLEARED lost`, E29) al robar del descarte, cantar ÚLTIMA,
expirar el reloj de turno o acabar la ronda. Con las dos cartas sin elegir, el
reloj las manda ambas al descarte sin efecto (E15). Si el 8 es robado
(D-049), el marcador pasa al ladrón. `DREW` lleva `count: 2` para que la vista
plegada descuente las dos del mazo.

## D-049 · 2026-10-29 · Robo de efecto: fase `STEAL_WINDOW` (implementa D-043)
Fase nueva `STEAL_WINDOW` y temporizador `steal` (`TIMER_FIRED{timer:'steal'}`),
con `stealWindowMs` en `config.ts` (1500; rango 1000–2500). Eventos
`STEAL_WINDOW_OPENED` y `EFFECT_STOLEN`. Decisiones de detalle: (a) si el **dueño**
acierta durante la ventana, ésta se cierra al instante y el efecto es suyo (la
carrera ya está consumida, D-050, así que nadie podría robar después); (b) tras el
robo, la ventana ya no existe, por lo que los intentos posteriores se rechazan
sin castigo (la carrera está cerrada); (c) un fallo no consume la ventana; (d) el
Doble Robo robado traslada el marcador al ladrón; (e) sin objetivos para el
ladrón (E8) el efecto se pierde y no vuelve al dueño; (f) un ladrón con su
último tótem gana la ronda (E6) y el efecto se cancela (E27). El tutorial local
deja vencer la ventana al instante. La ventana escala con «tiempo ×1,5» (D-057).

## D-050 · 2026-10-29 · carreras y Cadena con premio
Implementa #16. `GameState.race {open, hit}` y `chain`; `PlayerCore.chainPoints`.
Un descarte normal (robo descartado, sustitución, E15, carta rechazada del Doble
Robo) abre carrera; la carta inicial también; el rebarajado no. **Robar del
descarte no abre carrera y deja la expuesta no casable** (no se había definido en
#16; además su valor es desconocido para el cliente, D-008) y, si no hubo acierto,
rompe la cadena al abrirse la siguiente. Tras un acierto la carrera se cierra y
cualquier intento posterior se rechaza **sin castigo** con `MATCH_REJECTED
tooLate` (opción elegida frente a tratarlo como fallo). Eventos públicos
`CHAIN_LINK {player, link, bonus}` (bonus 0 en el eslabón 1, `chainBonusPerLink` =
−1 desde el 2.º) y `CHAIN_BROKEN`. El ajuste va en `score()` aparte de la
comparación de ÚLTIMA, sin suelo, y se suma al −5 de altar vacío. Se cierra así
la regla «las cadenas son posibles» de docs/01 §6.

## D-051 · 2026-10-29 · Presagios como datos en `config.omens`
Implementa #15. `omensEnabled` (false) y `omens: OmenDef[]` (`DEFAULT_OMENS`:
HASTE=Conejo 2 → `turnSeconds` 15, CALM=Tortuga 3 → 45, FLASH=Luciérnaga 0 →
`matchFailPublicRevealSeconds` 4). `currentOmen(state)` deriva el presagio del
tótem superior; la carta inicial no lo activa mientras siga siendo la inicial
(`initialTopId`, que se limpia si alguien la roba del descarte). `validateConfig`
rechaza presagios sobre tótems con efecto o duplicados. `OMEN_CHANGED` se emite
desde `apply` comparando el presagio antes/después (no en cada rama). Prisa y
Calma solo se leen al empezar el turno; `MATCH_FAIL` lleva `revealMs`. El
presagio del tótem recién descartado rige durante la ventana de robo (en la
práctica no hay ninguno: los tótems con efecto no tienen presagio).

## D-052 · 2026-10-29 · modo Salvaje: intento con `owner` y regalo a ciegas en la misma acción
`MATCH_ATTEMPT` gana `owner?` (dueño del tótem) y `giveSlot?` (slot propio que se
regala al acertar; por defecto **el primer ocupado**, porque se elige sin mirar y
así la acción es una sola). El tótem del rival va al descarte y el regalo ocupa el
hueco recién abierto (evento público `WILD_GIFT`; el rival nunca queda con 0). Un
fallo castiga `wildFailPenaltyFactor` (2) veces `matchFailPenaltyCards` al
intentador (con mano llena, +`fullHandPenaltyPoints` por carta: 10 en total, E14)
y el tótem fallado se ve como siempre. Los tótems de un sellado no son
atacables (`TARGET_SEALED`); sin la opción, `WILD_DISABLED`. Cuenta como acierto
para carrera, cadena y robo de efecto. Si regalar tu último tótem te vacía el
altar, ganas la ronda (E6). `legalActions` ofrece los intentos ajenos sin
`giveSlot`.

## D-053 · 2026-10-29 · regla Kamikaze
`kamikazeRule` y `kamikazeResetScore` (50, debe ser < `gameEndScore`): al puntuar
una ronda, quien queda con un total **exactamente** igual a `gameEndScore` pasa a
`kamikazeResetScore` antes de comprobar el fin de partida. Solo en Clásico. El
umbral es `gameEndScore` (100 por defecto) y no un 100 fijo, para que siga
siendo coherente al cambiar el umbral de sala. `ROUND_SCORED.kamikaze` lista a
los afectados. `validateConfig` deja de rechazar Salvaje y Kamikaze.

## D-054 · 2026-10-29 · protocolo v2
`PROTOCOL_VERSION` pasa a 2: `MATCH_ATTEMPT {owner?, giveSlot?}`,
`DOUBLE_DRAW_KEEP {index}`, objetivos `SHARED_EYE`, `RUMBLE`, `SEER_LOOK`,
`SEER_SWAP`, y opciones de sala `stealWindowMs`, `omensEnabled`,
`wildModeEnabled` y `kamikazeRule` (`RoomConfigSchema`). Los eventos nuevos de
`core` viajan sin esquema zod (como el resto de S2C). `PlayerView` gana campos
opcionales (`chain`, `omen`, `effect`, `drawnChoice`, `doubleDraw`) para no romper
al cliente existente.

## D-055 · 2026-10-29 · bots con las reglas v2
`GreedyBot` resuelve efectos propios y robados aunque no sea el jugador activo;
mira lo que no recuerda, solo truequea para endosar un tótem recordado ≥ 8 y si no
pasa; en el Doble Robo se queda con la más baja; no insiste en un Descarte Rápido
con la carrera cerrada (evita bucles de rechazos) y no usa el modo Salvaje.
Arreglo asociado: `EFFECT_RESOLVED` de un Vislumbre propio ya no borra el
recuerdo recién fijado. Los presagios no cambian su estrategia (sigue siendo
una deuda: Prisa podría empujarlo a decidir más rápido). `RandomBot` sigue
eligiendo al azar entre lo legal salvo ÚLTIMA y Descarte Rápido.

## D-056 · 2026-10-29 · simulador con rotación de opciones de sala
`tools/sim` rota Salvaje, Presagios y Kamikaze por bits del índice de partida
(Kamikaze en Clásico a 50 puntos), comprueba I1 con `drawnChoice`, I2 en eventos
públicos, I6 (sellados), una sola jugada por carrera, coherencia de ventana de
robo, Doble Robo y presagios, y falla si en una campaña de ≥ 200 partidas no ve
alguno de los eventos v2 esenciales.

## D-057 · 2026-10-29 · «tiempo ×1,5» y los relojes nuevos
`GameSession.buildConfig` escala también `stealWindowMs` (acotado al máximo del
rango) y los `turnSeconds`/`matchFailPublicRevealSeconds` de los presagios.
Límite heredado: los multiplicadores cercanos a 2 sacan `privateRevealSeconds`
de rango (3 × 2 = 6 > 5) y la sala no arranca; no se ha tocado.

## D-058 · 2026-10-29 · cliente: solo compatibilidad
El cliente no implementa UI de las reglas v2 (otro trabajo). Cambios mínimos: el
tutorial local deja vencer la ventana de robo y reinicia la carrera al
recolocar el descarte, y el diccionario i18n nombra los efectos nuevos. Los
objetivos de Ojo Compartido, Revuelo y Trueque Vidente aún no son seleccionables
desde la mesa 3D (el botón «Pasar» sí).

## D-059 · 2026-10-30 · assets 3D y referencias de avatar versionados en git, sin LFS
`assets/` (FBX + textura del oso, ~24 MB) y `avatar/` (referencias de personajes,
~1 MB) se suben al repo directamente: el volumen actual no justifica Git LFS ni
un repo externo. Se reevalúa si `assets/` supera ~100 MB o entran FBX por
personaje. Riesgo abierto: el repo es público y el FBX del oso viene de Mixamo
(sus términos permiten usarlo en el juego, no redistribuir el fichero suelto);
hay que decidir si se mueve a un repo privado o se sustituye antes del lanzamiento.

## D-060 · 2026-10-30 · flujo de ramas
`feature/worktree → integrate/* → PR a develop → main`. Cada PR a `develop` se
mergea con merge commit para dejar constancia. Las ramas `worktree-agent-*`,
prototipos descartados y ramas ya fusionadas se borran tras el merge; los
worktrees viven en `.claude/worktrees/` (ignorado por git). Los prototipos que
se quieran conservar como referencia llevan prefijo `prototype/` y se documentan.

## D-061 · 2026-10-30 · prototipo del gesto del oso (estado)
`oso-curves.ts` (interpolación PCHIP y cuaterniones por longitud de arco),
`oso-ik.ts` (IK de brazo y dedos), `oso-gesture.ts` (gesto de coger carta) y
`oso-preview.*` (vista previa aislada, no integrada en el juego). Validado con
sonda Playwright: cero colisiones brazo/mano–mesa en la fase de sujeción.
Pendiente: integrarlo en la escena, gesto para animales sin brazos (serpiente) y
biblioteca común de 11 poses (D-045).

## D-062 · 2026-10-30 · limpieza de ramas y prototipos conservados
Tras la PR #17 solo quedan `main` y `develop` como ramas de línea base. Se
conservan en origin, sin fusionar: `feature/pwa-install` (instalación PWA con
tests, pendiente de revisar e integrar) y `prototype/hud-amnesia` (HUD variante
D, `PrototypeHud.tsx` + `prototype-immersive.ts`, referencia de diseño).
`prototype/legibilidad-7` (legibilidad de tótems a 360 px) se borra por
descartable; el riesgo sigue descrito en `docs/05-direccion-vista.md`.
`docs/research/assets-cc0-pixel-low-poly.md` se incorpora como documento
histórico: D-014 (arte por código) quedó superado por D-059 (modelos Mixamo).
