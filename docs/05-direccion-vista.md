# 05 — Dirección de vista: formato «mesa con personajes» (referencia Liar's Bar)

> Estado: **APROBADO** (2026-10-21). El dueño acepta las recomendaciones de §4 con estilo
> «Megabonk» (pixel-art en 3D) y tono de misterio nocturno. Decisión registrada en
> `docs/decisiones.md` (D-042); lo normativo vive ya en `docs/01` §11–12 y el trabajo en
> `docs/03` WP-18. Este documento queda como investigación de referencia.
>
> Convención del documento: **[visto]** = observado directamente en las fuentes citadas;
> **[deducido]** = inferencia mía a partir de lo visto (no verificado jugando).

---

## 1. Liar's Bar: cómo es la vista y el formato

### Fuentes consultadas (todas abiertas el 2026-10-21)

- Ficha de Steam (texto + 17 capturas): https://store.steampowered.com/app/3097560/Liars_Bar/
- Capturas a resolución completa de esa ficha (CDN de Steam), en concreto
  `ss_c60c40ba…`, `ss_bd5a66c1…`, `ss_4da12455…`, `ss_314b9811…`, `ss_499a9f98…`,
  `ss_0216226b…`, `ss_df8aa529…`, `ss_add1e92c…`, `ss_984feac0…`
  (`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3097560/…/ss_<hash>.1920x1080.jpg`).
- Wikipedia (EN): https://en.wikipedia.org/wiki/Liar%27s_Bar — motor Unity, Windows/Android, personajes.
- Guía de la comunidad «Rules Summary for Deck/Dice»: https://steamcommunity.com/sharedfiles/filedetails/?id=3344163995 — controles por teclado.
- Referencia de estilo Megabonk (ficha + 2 capturas): https://store.steampowered.com/app/3405340/Megabonk/

No pude ver: los tráileres (el reproductor de Steam no cargó en el panel), el wiki de Fandom
(no existe) ni la reseña de Flayrah (bloqueo anti-bot; no se intentó saltar). No guardé
capturas en disco; no se ha copiado ningún asset ni texto.

### Cámara y encuadre

- **[visto]** Primera persona, sentado a una **mesa redonda de 4**. Los 3 rivales ocupan
  izquierda, frente y derecha; los laterales quedan **cortados por el borde de la pantalla**
  (se ve medio torso, brazo y cabeza), el de enfrente entero de cintura para arriba.
- **[visto]** La mesa ocupa aprox. la **mitad inferior a dos tercios** del encuadre; el centro
  de la mesa cae algo por debajo del centro de la pantalla. Los rivales ocupan la franja
  superior. Personajes grandes: su cabeza está más o menos a la altura de los ojos de la cámara.
- **[deducido]** Ojo a ~0,45–0,5 m sobre el tablero, inclinación hacia abajo de ~20–25°,
  FOV vertical ~55–65°.
- **[visto]** **Tus manos se ven** en 3D y sostienen el objeto del modo: abanico de cartas
  (Deck), dos cartas grandes en primer plano (Poker), el cubilete levantado con tus dados
  debajo (Dice), la tragaperras (Slots) y el revólver en la mesa.
- **[visto]** Hay **giro de cabeza libre**: una captura mira de lado/arriba hacia la barra y un
  rival, con los nombres flotando sobre ellos. En pantalla aparece la ayuda «Look [SPACE]».
  **[deducido]** Space alterna una mirada (en Dice, la guía confirma «Space — check your cup»:
  levantar el cubilete y bajar la vista a tus dados).
- **[visto]** Al morir, la cámara cae de lado con una viñeta de salpicadura; al quedar
  eliminado hay una vista de espectador en tercera persona («Switch Camera») desde el fondo del
  bar, con la mesa al fondo y otros personajes de pie alrededor.

### Interfaz: 3D frente a 2D

- **3D:** mesa, personajes, cartas en las manos de todos (los rivales sostienen su abanico de
  cartas por el dorso), cartas jugadas boca abajo en el centro, revólveres frente a cada asiento,
  botellas de veneno y cubiletes (Dice). En Dice, **«<nombre>'s TURN» está pintado sobre el
  tablero** con una flecha (indicador de turno diegético) **[visto]**.
- **2D [visto]:**
  - Arriba a la izquierda: estado de la mesa («ACE'S TABLE») y **la última declaración** con
    retrato del jugador («<nombre> CLAIMS 2 x ACES»). En Poker, la última acción («<nombre> CALLED»)
    y una escalera de posiciones.
  - Arriba en el centro: **temporizador circular con número** y nombre + icono del jugador activo.
  - Arriba a la derecha: «Your Turn / Your Bid» y la **lista de acciones disponibles con su tecla**
    (cambiar carta, seleccionar, lanzar, «Call LIAR!»).
  - Sobre cada rival, etiqueta 3D/billboard con nombre y contador de recámara «(0|6)».
  - Abajo: «Press Enter to chat» (izquierda), icono de micrófono (centro, chat de voz),
    «Look [SPACE]» / «Hints» (derecha).
  - Revelación de Poker: panel 2D superpuesto con la mano de cada jugador y su resultado.
- **[visto, guía]** No hay barra de cartas 2D: eliges con A/D la carta resaltada **dentro del
  abanico 3D**, Space la marca y E juega; X acusa.
- **[visto]** Las acciones se anuncian con texto 2D (arriba izquierda) + la animación del
  personaje. **[deducido]** El chat de voz de proximidad hace gran parte del «anuncio».

### Ambiente

- **[visto]** Bar interior, nocturno, luz cálida de bombillas colgantes, neón rojo «LIAR'S» y uno
  azul, suelo de madera, celosías de estilo oriental, escalera, barra con botellas. Otros
  personajes de ambiente en la barra.
- **[visto]** Estilo 3D estilizado con PBR y sombras suaves (no low-poly, no pixel-art).
  Animales antropomórficos (cerdo, dóberman, panda rojo, conejo, rinoceronte, búfalo…), con
  expresiones faciales.
- **[visto]** Momento de castigo: los personajes empuñan el revólver; encuadre dramático.

### Lo esencial del formato frente a lo propio de Liar's Bar

| Esencial (lo que queremos) | Propio de Liar's Bar (no copiar) |
|---|---|
| Primera persona sentado; rivales como personajes grandes alrededor | Bar, neón, violencia (revólver, veneno) |
| La mesa como escenario principal, objetos de juego en 3D | Diseños concretos de personajes, nombres, logotipo |
| Ver lo que hace cada rival con las manos | Chat de voz como mecánica central |
| Mirar abajo para ver lo tuyo | Mesa fija de 4 |
| HUD 2D en esquinas: estado de mesa, última acción, temporizador, acciones con tecla | Selección de cartas dentro del abanico 3D |

---

## 2. Traducción a TÓTEM

### 2.1 Asientos (2–6 jugadores): herradura, no círculo completo

El jugador local siempre en el asiento 0. **[deducido, geométrico]** Con FOV vertical 55° y
16:9, el FOV horizontal es ~85° (±42°). Un rival a ángulo φ alrededor del centro (0° = tú) se ve
a `90° − φ/2` del centro de la pantalla. Con el reparto actual en círculo (`seatAngle = i/N·360°`),
a 6 jugadores los vecinos (φ = 60°) caen a 60°: **fuera de pantalla**. Liar's Bar se lo puede
permitir porque solo tiene 4.

Propuesta: repartir los rivales en un arco **φ ∈ [100°, 260°]** (todos dentro de ±40°):

| Jugadores | φ de los rivales |
|---|---|
| 2 | 180 |
| 3 | 125, 235 |
| 4 | 110, 180, 250 (como Liar's Bar) |
| 5 | 100, 153, 207, 260 |
| 6 | 100, 140, 180, 220, 260 |

Con radio de asiento 1,45 m, 40° de separación ≈ 1 m de cuerda entre rivales: caben personajes
anchos. Para 6 conviene una mesa algo mayor (radio 1,8) o una mesa ovalada en mapas concretos.

### 2.2 Cámara: dos poses + giro limitado

- **Pose «mesa»** (por defecto): ojo a +0,45 m sobre el tablero, inclinación ~15–18°. Caras de los
  rivales en el tercio superior, centro de la mesa (mazo/descarte) en el centro, tus tótems en la
  franja inferior (requisito duro §11: deben verse aquí también, aunque pequeños).
- **Pose «mis tótems»**: inclinación ~50°, tus 4–8 tótems llenan la mitad inferior, los rivales
  quedan en el borde superior (siguen viéndose las manos). Toggle con Space / botón / gesto
  arrastrar hacia abajo; transición de 0,25 s. Equivale al «check your cup» de Liar's Bar.
- **Giro lateral** ±30° con ratón/arrastre, con regreso automático al centro. No 360°.
- **Comprobación del requisito duro**: con FOV 55° e inclinación 15°, el borde inferior mira a
  42° hacia abajo; con el ojo 0,42 m sobre la mesa, los tótems deben estar a ≤ 0,5 m en horizontal
  del ojo. Hay que testearlo en `layout.test.ts` para 4 y 8 slots y para las dos poses.
- Mis manos: **solo visibles durante mis acciones** (robar, sostener la carta frente a la cámara,
  sustituir, golpear en Descarte Rápido), para no tapar los tótems.

### 2.3 Qué va en 3D y qué en 2D

**3D:** mesa y mapa; personajes rivales; los tótems de todos (fila en la mesa delante de cada
personaje, huecos incluidos, E21); mazo y descarte en el centro; vela-reloj del jugador activo;
campana de ÚLTIMA a tu derecha; nombre + contador de tótems + marcador sobre cada rival (billboard).

**Barra 2D inferior (nueva):** una fila de 8 casillas que refleja tus slots 0..7 **por posición**:
hueco, ocupado, resaltado legal, sellado, bloqueo de 5 s (cuenta atrás) y selección actual.
Permite elegir con teclado (1–8 / A-D) o tocando. **Nunca muestra valores**: lo que viste con
Vislumbre se olvida (es la mecánica central, E18). Solo durante una vista privada (3 s) la
casilla correspondiente puede mostrar el valor a la vez que la carta 3D.

**Resto del HUD 2D** (siguiendo el esquema de esquinas de Liar's Bar):
- Arriba izquierda: carta superior del descarte en grande + última acción
  («Ana sustituyó su slot 2»). Es el equivalente del «CLAIMS 2 x ACES».
- Arriba centro: temporizador numérico + quién juega (duplica la vela por accesibilidad).
- Arriba derecha: acciones legales con su tecla (Robar mazo / Robar descarte / Descartar /
  Sustituir / Omitir / ¡ÚLTIMA!), alimentadas por `legal` del servidor.
- Laterales: log de subtítulos (ya existe) y rueda de emotes.

Esto contradice «UI diegética siempre que sea posible» de §11: hay que reescribirlo como
«diegético + HUD 2D en esquinas y barra inferior».

### 2.4 Animación de los rivales (pocas animaciones)

Personaje = **marioneta rígida** low-poly (torso, cabeza, 2 brazos de 2 piezas, manos-pala), sin
skinning; las poses se interpolan con GSAP desde el `presenter`. La carta viaja en una curva entre
la mano y el destino. 8 poses bastan:

| Acción (evento) | Animación del rival | Notas |
|---|---|---|
| Idle / esperando | respiración, mirar a quien juega | bucle, desfase aleatorio |
| Su turno | se inclina, la vela se enciende delante | |
| Robar del mazo | estira el brazo al centro, se lleva la carta a la cara | **tú ves el dorso** (E22) |
| Robar del descarte | igual, pero la carta queda de cara (pública) | |
| Descartar | lanza la carta en arco al descarte | 0,5 s |
| Sustituir | baja la carta a su slot N, levanta la vieja y la lanza | ve qué slot (público) |
| Vislumbre / Espionaje / Trueque | señala/levanta el slot elegido; el VFX actual se reancla a su mano | |
| Descarte Rápido | **golpe rápido de mano** sobre su tótem (≤ 0,25 s) | acierto: la carta salta; fallo: retroceso + sacudida |
| ¡ÚLTIMA! | puñetazo en la mesa / toca su campana; cadenas de luz | 1,5 s |
| Revelación / fin | reacción: brazos arriba / cabeza abajo | |

Regla: la animación **nunca retrasa** la apertura de ventanas de Descarte Rápido; el `presenter`
puede acortar o saltar animaciones si se acumulan eventos (la cola FIFO ya existe).

### 2.5 Estilo pixel-art 3D (referencia Megabonk) y mapas

- **[visto]** Megabonk: low-poly, texturas pequeñas sin suavizado (píxel visible en piedra,
  hierba, personajes), colores planos y saturados, iluminación simple con niebla de distancia.
- Propuesta: modelos low-poly; texturas de 16–64 px con `NearestFilter` y sin mipmaps; render a
  un objetivo de baja resolución (alto ~360 px) escalado con *nearest*; paleta cerrada de 24–32
  colores por mapa (opcional: pase de cuantización por LUT). El toon shading actual encaja.
- **Mapa** = descriptor de datos `{ id, mesa (forma/radio/material), fondo, luces, paleta,
  ambiente sonoro }` sobre la misma `layout`. El nocturno con velas es el mapa 1. Es solo
  cosmético: no afecta reglas ni protocolo.

---

## 3. Impacto técnico en `packages/client` (estimación)

| Módulo | Cambio |
|---|---|
| `scene/layout.ts` (+ test) | **Rehacer**: asientos en herradura por N, poses de cámara, anclajes de personaje (manos, cabeza, placa), radio de mesa por mapa. Tests del requisito duro (tótems visibles en ambas poses, 4 y 8 slots). |
| `scene/world.ts` (391 líneas) | **Rehacer y dividir**: `camera-rig.ts` (poses, giro, respiración), `characters.ts` (marionetas), `totems.ts` (**InstancedMesh** con atlas de caras), `maps/` (descriptores + carga del mapa). `world.ts` queda como orquestador. |
| `scene/textures.ts` | Pasar a atlas pixel de baja resolución, nearest. Mantener número grande + icono (accesibilidad §11). |
| `scene/postfx.ts`, `palette.ts` | Pase de baja resolución + upscale nearest; viñeta/grano revisados; paleta por mapa. |
| `vfx/sequences.ts` | Reanclar orígenes a las manos de los personajes; nuevas secuencias de golpe y reacción. |
| `presenter/timelines.ts` | Duraciones de beats que incluyen la animación del personaje; política de recorte. `queue.ts` se mantiene. |
| `ui/Table3D.tsx` + `hud/` | Barra 2D de slots, panel de estado de mesa, lista de acciones con tecla, toggle de vista. |
| Se mantienen | `reconcile.ts`, `anim-lock.ts`, `net/`, `state/`, `core`, `protocol` (sin bump de protocolo). |

**Presupuesto (doc 02: ≤ 80 draw calls, 60 fps en portátil; objetivo móvil 30 fps):**

- Hoy cada tótem es un `Mesh` con material propio → hasta 48 draw calls solo en tótems (6×8).
  Con InstancedMesh: 2 (dorso + caras).
- Estimación: mapa/fondo 8–10 · mesa 2 · tótems 2 · pilas 2 · personajes 5 × 3 (cuerpo fusionado +
  2 brazos) = 15 · placas (atlas único) 1–5 · VFX 3–5 · postfx 3–4 → **~40–50**. Margen razonable.
- El render a ~360 px reduce mucho el coste de fragmentos: ayuda al objetivo móvil.
- Medir con el `stats` existente de `world.ts` (drawCalls/triangles/fps).

**Riesgos:**

1. **Legibilidad** de los números a 360 px (requisito de accesibilidad). Mitigación: cartas a
   resolución mayor en la mitad inferior, o la vista privada muestra el valor también en 2D.
2. **Filtrar información**: la barra 2D o la animación del rival no deben revelar valores
   (I2, E22). La carta que sostiene un rival se pinta siempre por el dorso.
3. **Tapar tótems**: brazos de los rivales encima de sus filas → animaciones cortas y tótems
   delante del alcance del brazo.
4. **6 jugadores**: aunque quepan en pantalla, las filas de tótems lejanas quedan pequeñas;
   Espionaje y Trueque necesitan apuntar bien → resaltado + selección por teclado.
5. **Retrasos en Descarte Rápido**: la puesta en escena no puede bloquear la entrada.
6. **Móvil en vertical**: el FOV horizontal cae a ~35°; la herradura no cabe. Empezar solo en
   horizontal.
7. **Coste de arte**: 6+ personajes y 3 mapas. Placeholders CC0 low-poly (Quaternius) encajan
   con el estilo.
8. **Mareo** con el giro de cabeza: limitado, con amortiguación y desactivable.
9. **Parecido a Liar's Bar**: usar el formato, no sus diseños (sin bar con neón, sin animales
   calcados); la temática totémica da personajes propios.

---

## 4. Preguntas abiertas (con recomendación)

1. **¿Giro de cabeza libre o poses fijas?** → Dos poses (mesa / mis tótems) + giro ±30° con vuelta
   al centro. Sin 360°.
2. **¿Se ven mis manos?** → Solo durante mis acciones.
3. **¿La barra 2D muestra valores que ya vi?** → **No**, nunca: rompería el juego de memoria.
   Solo el estado de cada slot.
4. **¿Qué personajes?** → Animales totémicos originales en low-poly (búho, zorro, oso, ciervo,
   serpiente, cuervo…), coherentes con los iconos de las cartas; 6 al lanzar, uno por asiento,
   que el jugador elige en el lobby.
5. **¿Herradura o círculo?** → Herradura (§2.1); círculo solo en la cámara de revelación.
6. **¿Resolución interna del pixel-art?** → ~360 px de alto, ajustable en opciones; validar
   antes la legibilidad de las cartas.
7. **¿Paleta común o por mapa?** → 24–32 colores por mapa; la UI 2D con paleta propia y fija
   (contraste y modo daltónico).
8. **¿Qué mapas y quién elige?** → 3 en v1: nocturno con velas + 2 por decidir (p. ej. cueva
   helada, templo en la selva). Los elige el anfitrión en el lobby; solo cosméticos.
9. **¿Cámaras de reacción o cinemáticas?** → Solo en ¡ÚLTIMA! y en la revelación final (cámara
   que se eleva); nunca mientras haya ventana de Descarte Rápido abierta.
10. **¿Móvil vertical?** → Fuera del alcance inicial; solo horizontal.
11. **¿Cambia los docs normativos?** → Sí: ADR en `docs/decisiones.md` y reescribir §11 (cámara,
    HUD) y §12 (estilo, paleta) de `docs/01` antes de implementar. Proponer un WP en `docs/03`.
