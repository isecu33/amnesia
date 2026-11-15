---
name: blender-rig
description: Rigging, pesos y animación de los animales de TÓTEM en Blender 4.2 headless (tools/rig/rig_animal.py) y su validación automática (tools/rig/rig_qa.py + agente rig-validator). Úsala siempre que toques un rig, pesos, poses o animaciones de assets/<animal>/, cuando una malla se vea rota/estirada al moverse o cuando un movimiento parezca robótico.
---

# Rig y animación de TÓTEM (Blender 4.2)

Prácticas adaptadas de `blender-character-rigging`, `blender-animation` y `blender-asset-qa`
de [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (MIT). Esas skills piden
Blender 5.2 y Rigify; aquí usamos 4.2.3 (`D:\Programas\blender.exe`) y un rig propio ligero (D-063).

## Flujo (no se da nada por bueno sin el validador)

```
blender -b --python tools/rig/rig_animal.py -- <animal> assets/<animal>/<animal>.fbx <salida>.glb
blender -b --python tools/rig/rig_qa.py     -- <salida>.glb <informe>.json <dir_renders>
```

1. Genera el GLB en una carpeta temporal, **no** encima de `assets/` hasta que pase el QA.
2. `rig_qa.py` sale con código 1 si hay algún FAIL. Los WARN se miran en los renders.
3. Delega la revisión en el agente **`rig-validator`** (contexto propio, no es quien hizo el
   cambio): ejecuta el QA del antes y el después, mira los renders y emite el veredicto.
4. Solo con PASS del agente se copia el GLB a `assets/<animal>/`.

## Qué mide rig_qa.py y qué significa

Referencia: la pose de reposo del GLB (tras `bake_seated`, la pose sentada).

| Métrica | FAIL | Lectura |
|---|---|---|
| `bad_edge_frac` | > 0,2 % | aristas que se estiran >×1,6 o encogen <×0,45 (con cambio ≥ 4 mm) |
| `max_growth_cm` | > 3 cm | una arista que crece eso se ve como desgarro |
| `fold_frac` | > 0,1 % | aristas cuyo diedro se cierra >110° (pliegues, piel que se dobla) |
| `seam_open` | > 1 cm | costuras de UV (vértices duplicados) que se separan |
| `island_gap` | > 3 cm | piezas sueltas (ojos, hebillas) que se despegan del cuerpo |
| `accel` | > 60 000 °/s² | tirón: un hueso cambia de velocidad de golpe (pop) |
| `frozen_s` | WARN > 0,6 s | pausa totalmente congelada: falta un *moving hold* |
| sin peso / >4 influencias | FAIL / WARN | glTF y three.js esperan ≤ 4, normalizados |

`bad_by_bone` dice qué hueso domina los vértices rotos y `bad_samples` da posición y pesos
de los peores: empieza siempre por ahí. Los renders `*_calor_*` pintan azul→rojo (rojo =
umbral FAIL) en el peor fotograma de cada animación; los `*_tex` son el aspecto real.

Las 1000+ "islas" que aparecen al importar un GLB son cortes de UV del exportador, no
roturas: el QA las suelda por posición. La fuente FBX es una sola pieza cerrada.

## Lecciones (por qué el rig está montado así)

- **La pose sentada es el reposo.** Los animales nunca están en A-pose en el juego. El gran
  giro (brazos colgando → antebrazos sobre la mesa, piernas a 90°) se hornea una vez con
  Corrective Smooth (`bake_seated`) y las animaciones son giros pequeños desde ahí. Medido en
  el oso: aristas malas del 9,6 % al 0,1 %.
- **Lo grande va al horneado, no a la animación.** Si un gesto necesita un giro enorme de
  hombro (alcanzar la carta), acerca el reposo a ese gesto (`REST_FWD`) e implica al tronco
  (`LEAN`): una persona sentada se inclina para alcanzar, no estira solo el brazo.
- **Reparte los giros por la cadena.** `mirar` gira columna→pecho→cuello→cabeza (5/9/14/18°);
  concentrarlo en el cuello retorcía el cuello de pelo.
- **Pesos:** transición de 1–2 anillos en cada articulación (`smooth_weights`), ≤ 4
  influencias, normalizados. Un corte duro 1/0 pliega; uno demasiado ancho hace goma.
  Accesorios rígidos (hebillas, cascos): 100 % a un hueso.
- **El esqueleto se centra en el torso, no en la caja envolvente:** colas y enroscados
  desplazaban todo el esqueleto hasta 13 cm hacia atrás (zorro), con pesos sin sentido y el
  animal hundiéndose 45 cm en el suelo.
- **La raíz no deforma** (`use_deform = False`); las colas largas llevan hueso propio (`cola`)
  que se apoya hacia atrás al sentarse; las suelas bajo el suelo se aplastan al hornear.
- **Gesto sin IK (aves, serpiente):** `AMP` reduce el giro del ala/garra, pero bajarlo demasiado
  deja el ala abierta hacia atrás en vez de hacia la carta (el validador lo marcó como
  regresión de plausibilidad). Falta un gesto propio con IK para las alas.
- **No quites pesos por radio cerca de la cabeza** sin medirlo: forzar el cuello de pelo al
  pecho creó un corte cabeza/pecho peor que el original.

## Animación natural

- **Nunca congelado:** `reposo` respira (`breathe`, ciclo 2,4 s, primer = último fotograma
  para que el bucle no salte). Las pausas son *moving holds* (`hold`: leve reajuste).
- **Anticipación:** antes de alcanzar, el tronco cede y la mirada se adelanta (`prep`).
- **Solapamiento / seguimiento:** `lag()` retrasa claves intermedias: el brazo va 2
  fotogramas tras la mirada y los dedos 4 tras la mano; al mirar, el cuello sigue a la cabeza
  y el pecho al cuello.
- **Arcos y ease:** claves Bézier auto-clamped (ease in/out sin rebote); el IK con polo
  `abajo y hacia fuera` mantiene el codo natural.
- **30 fps.** `rig-preview.ts` cuenta tiempos en /30 (`CARRY_FROM`/`CARRY_TO`): si cambias
  los fotogramas de agarre/suelta en `coger_carta`, cámbialos allí también.
- Cuaterniones en todos los huesos; no animes escala.
