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
