# Assets CC0 para pixel-low-poly

> Research del ticket [#10](https://github.com/isecu33/amnesia/issues/10) (mapa [#2](https://github.com/isecu33/amnesia/issues/2)).
> Fecha: 2026-10-25. Fuentes primarias: páginas oficiales de cada autor, ficheros `License.txt` de los zips
> y fichas de modelo en Poly Pizza (que muestran la licencia por modelo). No se usa ni se recomienda nada
> de Liar's Bar ni de Megabonk.

## Pregunta

¿Qué packs CC0 (o de licencia compatible) ofrecen animales low-poly, mesa/props y texturas pequeñas que
encajen con el estilo pixel-low-poly (modelos low-poly, texturas de 16–64 px con filtrado `nearest`,
render a ~360 px de alto en Three.js), y qué licencia y formato tienen?

## Respuesta corta

- **Base recomendada: Kenney + KayKit + Quaternius (solo packs CC0).** Los tres publican glTF/GLB y FBX/OBJ,
  sin atribución obligatoria.
- **Cobertura de animales del mazo: ~8 de 14 con CC0 directo** (ciervo, zorro, conejo, ratón, serpiente,
  cuervo/cuervo blanco vía paloma recoloreada, jabalí vía cerdo/«hog»). **Huecos:** búho, búho real,
  tortuga, cabra (solo hay CC-BY 3.0 de «Poly by Google»), luciérnaga (mejor partícula/sprite que
  modelo) y chamán oscuro (humanoide, hay que componerlo).
- **Mesa, velas, campana: cubiertos con CC0** (Kenney Furniture/Graveyard, KayKit, Quaternius en Poly Pizza).
- **Personajes sentados antropomórficos: no existe un pack CC0 que lo dé hecho.** Hay que componer
  «marionetas rígidas»: cuerpo de bloque (Kenney Blocky/Mini Characters) + cabeza de animal (Kenney Cube Pets
  o cabezas recortadas de Quaternius).
- **Ningún pack trae «pixel-textures» reales.** Kenney y KayKit usan un atlas de paleta/gradiente
  (512–1024 px) que se puede bajar a 32–128 px con `NearestFilter` sin romper UVs; Quaternius (animales) usa
  colores planos por material, sin textura. El look Megabonk exige un paso propio de texturizado/cuantizado.
- **Cuidado con la licencia QAL de Quaternius** (packs nuevos, p. ej. *Bestiary*): no es CC0 y prohíbe
  redistribuir los assets sueltos; con el repo **público**, meter esos ficheros en git es arriesgado.
- **Choca con D-014** (`docs/decisiones.md`: assets generados por código, sin descargas): adoptar estos packs
  requiere una decisión nueva o limitarlos a la fase de arte F6.

## Packs evaluados

### Kenney — kenney.nl (CC0)

Licencia verificada en [kenney.nl/support](https://kenney.nl/support) («all game assets on the asset pages
are public domain licensed (CC0)») y en el `License.txt` de cada zip descargado
(«Creative Commons Zero, CC0 … crediting 'Kenney' … is not a requirement»). Todos los zips 3D revisados traen
**GLB, FBX y OBJ** (Furniture Kit además DAE/STL).

| Pack | Enlace | Contenido relevante (nombres de fichero reales) | Textura |
|---|---|---|---|
| Cube Pets (24 modelos, v2.0 con animaciones) | [kenney.nl/assets/cube-pets](https://kenney.nl/assets/cube-pets) | `animal-deer`, `animal-fox`, `animal-bunny`, `animal-hog`, `animal-bee`, `animal-caterpillar`, `animal-cat`, `animal-dog`… | `colormap.png` 512×512 de franjas de color con gradiente |
| Graveyard Kit (91 modelos, v5.0) | [kenney.nl/assets/graveyard-kit](https://kenney.nl/assets/graveyard-kit) | `candle`, `candle-multiple`, `lantern-candle`, `altar-wood`, `altar-stone`, `pine`, `pine-crooked`, `rocks`, `character-keeper`, `character-skeleton`, `detail-chalice`, `urn-round` | `colormap.png` 512×512 |
| Furniture Kit (140 modelos) | [kenney.nl/assets/furniture-kit](https://kenney.nl/assets/furniture-kit) | `tableRound`, `table`, `chair`, `chairRounded`, `bench`, `rugRound` | colores por material (sin atlas) |
| Holiday Kit (99 modelos) | [kenney.nl/assets/holiday-kit](https://kenney.nl/assets/holiday-kit) | `lantern`, `lantern-hanging`, `hanukkah-menorah-candles`, `reindeer`, `tree-snow-*` | `colormap.png` |
| Mini Dungeon (30 modelos) | [kenney.nl/assets/mini-dungeon](https://kenney.nl/assets/mini-dungeon) | `table`, `chair`, `barrel`, `pot`, `banner` | `colormap.png` 512×512 |
| Fantasy Town Kit (167 modelos) | [kenney.nl/assets/fantasy-town-kit](https://kenney.nl/assets/fantasy-town-kit) | `lantern`, `tree-crooked`, `rock-*`, `stall-stool` | `colormap.png` 512×512 |
| Blocky Characters (18 personajes) | [kenney.nl/assets/blocky-characters](https://kenney.nl/assets/blocky-characters) | `character-a` … `character-r`, cuerpo de cajas tipo «skin» | una textura 1024×1024 por personaje, ilustración suave (no pixel art) |
| Mini Characters | [kenney.nl/assets/mini-characters](https://kenney.nl/assets/mini-characters) | `character-male-a…f`, `character-female-a…f` | `colormap.png` 512×512 |

Encaje: el mejor para el estilo. Geometría muy simple, un único atlas de paleta por pack; al bajar el
atlas a 32–64 px y usar `NearestFilter` las franjas siguen intactas y el gradiente se convierte en bandas,
que es justo el look buscado. Cube Pets es cúbico/chibi: sirve como **cabeza de marioneta** más que como
animal realista. Hueco: no hay búho, cuervo, tortuga, cabra, serpiente ni ratón.

### KayKit — kaylousberg.itch.io (CC0)

Cada página declara «Creative Commons Zero v1.0 Universal … Free for personal and commercial use, no
attribution required» (solo pide no revender copias sin modificar). Formatos **FBX, glTF, OBJ**; los
`.blend` solo en el tier de pago «Source». Todos comparten **un atlas de gradiente 1024×1024 que el autor
dice que se puede bajar a 128×128**.

| Pack | Enlace | Contenido relevante | Tier gratis |
|---|---|---|---|
| Dungeon Pack (remake) | [kaykit-dungeon-pack](https://kaylousberg.itch.io/kaykit-dungeon-pack) | mesas, sillas, barriles, cofres, estandartes; velas (en Poly Pizza aparecen `Candle`, `Candles`, `Candle Melted`, `Skull Candle`, `Plaque Candles` de Kay Lousberg, CC0) | 200 assets gratis; Extra $7.95 |
| Forest Nature Pack | [kaykit-forest](https://kaylousberg.itch.io/kaykit-forest) | árboles, rocas, arbustos, hierba (anillo de bosque para el fondo) | 100+ modelos gratis |
| Halloween Bits | [halloween-bits](https://kaylousberg.itch.io/halloween-bits) | lápidas, mausoleo, árboles, calabazas | 60+ gratis |
| Furniture Bits | [furniture-bits](https://kaylousberg.itch.io/furniture-bits) | mobiliario; `Round Table` de Kay Lousberg en Poly Pizza, CC0 ([ficha](https://poly.pizza/m/KZXCuGx1WZ)) | — (no verificado en la página del pack) |
| Character Pack: Adventurers | [kaykit-adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | humanoides rigged/animados (base para el chamán oscuro) | — |

Encaje: excelente para props y entorno (mismo enfoque de atlas que Kenney). **Sin animales.**

### Quaternius — quaternius.com (CC0, salvo packs QAL)

El FAQ dice «All models are under the CC0 License» y «attribution is not necessary»
([faq](https://quaternius.com/faq.html)); las páginas de pack revisadas enlazan a CC0 1.0
(Ultimate Animated Animals, Farm Animal, Fantasy Props MegaKit, Stylized Nature MegaKit, Universal Base
Characters, Ultimate Furniture, Ultimate House Interior). **Excepción:** *Bestiary – Dungeon Monsters Kit*
enlaza a la [Quaternius Asset License (QAL) v1.0](https://quaternius.com/license.html): uso comercial libre
y sin atribución, pero **prohíbe redistribuir los assets como tales**, también modificados. Comprobar la
licencia de cada pack nuevo antes de usarlo.

| Pack / modelo | Enlace | Formatos | Contenido relevante |
|---|---|---|---|
| Ultimate Animated Animal Pack (12 animales, 12+ animaciones) | [quaternius.com/packs/ultimateanimatedanimals.html](https://quaternius.com/packs/ultimateanimatedanimals.html) | FBX, OBJ, Blend, glTF | Visibles en la imagen oficial: cierva, **ciervo (stag)**, **zorro**, lobo, husky, shiba, alpaca, vaca, toro, caballo, burro (el 12.º no se distingue). Colores planos, sin textura |
| Farm Animal Pack (7 animales) | [farmanimal.html](https://quaternius.com/packs/farmanimal.html) | FBX, OBJ, Blend | La página no los nombra; en itch (pack anterior) aparecen vaca, caballo, llama, cerdo, pug |
| Modelos sueltos en Poly Pizza, autor «Quaternius», licencia «Public Domain (CC0)», FBX+glTF, animados | [Rat](https://poly.pizza/m/iltq5bVNaV), [Snake](https://poly.pizza/m/x9x0viZs8V), [Pigeon](https://poly.pizza/m/9NGlBTpDEr), [Fox](https://poly.pizza/m/Bc97C66HKi), [Rabbit](https://poly.pizza/m/mKev485XTR) (categoría «People & Characters», #Plush), [Pig](https://poly.pizza/m/TNvG3QUFlp), [Sheep](https://poly.pizza/m/C39AUXUUes) | FBX, glTF | **ratón, serpiente, cuervo (paloma recoloreada), zorro, conejo**, jabalí/cabra por aproximación |
| Props sueltos en Poly Pizza (CC0) | [Bell](https://poly.pizza/m/cILuaO115Y), [Candles](https://poly.pizza/m/AnzHB44wlW), Table Round Small | FBX, glTF | **campana**, velas, mesa redonda pequeña |
| Fantasy Props MegaKit (211 modelos) | [fantasypropsmegakit.html](https://quaternius.com/packs/fantasypropsmegakit.html) | FBX, OBJ, glTF (+Blend en Source) | muebles, cofres, libros, pociones; 4 sets de textura compartidos |
| Stylized Nature MegaKit (~116 modelos) | [stylized-nature-megakit](https://quaternius.itch.io/stylized-nature-megakit) | FBX, OBJ, glTF | árboles/rocas texturizados (estilo «Ghibli»), 81 gratis |
| Universal Base Characters + Universal Animation Library | [UBC](https://quaternius.itch.io/universal-base-characters), [UAL](https://quaternius.itch.io/universal-animation-library) | FBX/GLB | humanoides de ~13k triángulos; la UAL menciona «sitting» pero no confirma un idle sentado |

Encaje: la mejor fuente CC0 de **animales realistas animados**, pero sin textura (colores planos) y con
más polígonos que Kenney; para el look pixel hay que asignarles un atlas propio pequeño. UBC es demasiado
denso para «marionetas rígidas». Los packs completos de Pro/Source son de pago (el tier gratis suele ser
60–70 % del contenido).

### Poly Pizza / «Poly by Google» (CC-BY 3.0 — compatible con atribución)

Muchos animales que faltan existen como modelos de Google Poly republicados con
**Creative Commons Attribution 3.0** (verificado en fichas: [Great horned owl](https://poly.pizza/m/fNkq9CwSG6d),
[Raven](https://poly.pizza/m/7eQ51arTYDj), [Boar](https://poly.pizza/m/57fSWum6F1P); el mismo autor aparece en
las búsquedas de [turtle](https://poly.pizza/search/turtle) y [goat](https://poly.pizza/search/goat)).
Formatos OBJ + glTF. Son compatibles si se acredita en una pantalla de créditos, pero el estilo varía mucho
entre modelos (son de autores distintos) y habría que unificarlos.

### Otros (entorno)

- **Poly Haven** ([licencia](https://polyhaven.com/license)): «all licensed as CC0». HDRIs nocturnos
  fotorrealistas: no encajan con pixel-low-poly salvo muy cuantizados.
- **OpenGameArt**: hay skyboxes CC0 (estrellas/nebulosas de 1024², nubes nocturnas de Screaming Brain
  Studios), ninguno pixel art; la licencia se declara por subida y hay que verificarla una a una.

## Cobertura del mazo

| Tótem | Mejor opción CC0 | Alternativa | Estado |
|---|---|---|---|
| Luciérnaga | Sprite/partícula propia (o `animal-bee` de Cube Pets como base) | — | Hueco (mejor generarla) |
| Ratón | Quaternius `Rat` (Poly Pizza, CC0) | — | Cubierto |
| Conejo | Quaternius `Rabbit` / Kenney `animal-bunny` | — | Cubierto |
| Tortuga | — | Poly by Google `Turtle` (CC-BY 3.0) | Hueco CC0 |
| Ciervo | Quaternius Stag / Kenney `animal-deer` | — | Cubierto |
| Cabra | Quaternius `Sheep` adaptado | Poly by Google `Goat` (CC-BY 3.0) | Parcial |
| Jabalí | Quaternius `Pig` / Kenney `animal-hog` adaptados (colmillos, color) | Poly by Google `Boar` (CC-BY 3.0) | Parcial |
| Búho | — | Poly by Google owls (CC-BY 3.0) | Hueco CC0 |
| Búho real | — | Poly by Google `Great horned owl` (CC-BY 3.0) | Hueco CC0 |
| Cuervo | Quaternius `Pigeon` recoloreado negro | Poly by Google `Raven`/`Crow` (CC-BY 3.0) | Parcial |
| Cuervo blanco | Ídem, recoloreado blanco | ídem | Parcial |
| Serpiente | Quaternius `Snake` (Poly Pizza, CC0) | — | Cubierto |
| Zorro | Quaternius Fox / Kenney `animal-fox` | — | Cubierto |
| Chamán oscuro | Kenney `character-keeper` / Blocky Characters / KayKit Adventurers + máscara propia | — | Composición propia |

| Prop | Opción CC0 |
|---|---|
| Mesa redonda de madera | Kenney `tableRound`; KayKit `Round Table`; Quaternius `Table Round Small` |
| Velas | Kenney `candle`, `candle-multiple`, `lantern-candle`; KayKit `Candle(s)`; Quaternius `Candles` |
| Campana | Quaternius `Bell` (Poly Pizza, CC0). Kenney y KayKit: no encontrada |
| Bosque nocturno (skybox) | Mejor procedural (degradado + estrellas en código, coherente con D-014) + anillo de pinos Kenney `pine`/KayKit Forest con fog |
| Personajes sentados | Ningún pack CC0 los da hechos: componer cuerpo Kenney Blocky/Mini Characters + cabeza de animal (Cube Pets o cabeza de Quaternius) como marioneta rígida, sin rig |

## Encaje con pixel-low-poly (pipeline sugerido)

1. Descargar GLB, bajar el atlas (Kenney 512→32/64 px, KayKit 1024→64/128 px) y cuantizar a la paleta del mapa.
2. En Three.js: `texture.magFilter = texture.minFilter = THREE.NearestFilter`, `generateMipmaps = false`,
   render a un `WebGLRenderTarget` de ~360 px de alto y escalar con `nearest`.
3. Quaternius (animales sin textura): asignar un atlas pequeño propio por UV o un material de color plano
   con ruido/dither en shader; si no, se ven «flat shaded» y no pixel.
4. Unificar escala y número de polígonos entre autores (Kenney/KayKit ≪ Quaternius) para que la mesa no
   mezcle estilos.

## No verificado / dudas abiertas

- Lista exacta de los 12 animales del Ultimate Animated Animal Pack (la página no los nombra; deducidos de
  la imagen oficial) y de los 7 del Farm Animal Pack.
- Pack de origen de los modelos sueltos de Quaternius en Poly Pizza (Rat, Snake, Pigeon, Rabbit, Bell,
  Candles) y si siguen siendo CC0 en su pack actual (Poly Pizza los marca CC0; no se encontró la página de
  pack equivalente). Si alguno viene de un pack QAL, no puede ir al repo público.
- Si `Rabbit` de Quaternius es animal o personaje antropomórfico («People & Characters», #Plush): podría
  servir para los personajes sentados; no se pudo ver la imagen.
- Contenido exacto de KayKit Furniture Bits y si el idle «sitting» existe en la Universal Animation Library.
- No se probó ningún asset renderizado a 360 px en el cliente; el encaje visual es una estimación a partir
  de las texturas y capturas oficiales.
