---
description: Arranca un paquete de trabajo con el contrato completo de docs/03 §4
argument-hint: WP-NN [nota opcional de alcance]
---

Vas a ejecutar el paquete de trabajo **$1** de `docs/03-plan-y-guia-agentes.md` §5.
Nota adicional del encargo (puede estar vacía): $ARGUMENTS

Sigue este procedimiento, sin saltarte pasos:

1. **Lee el contrato.** `CLAUDE.md`, la ficha de $1 en `docs/03` §5, y las secciones de
   `docs/01` y `docs/02` que esa ficha cita como entradas. No leas el resto: el contexto
   pequeño es lo que mantiene preciso al agente.

2. **Elige al especialista.** Delega en el subagente que corresponda al paquete y pásale el
   contrato entero:
   - reglas, puntuación, vistas, casos E, invariantes I → `core-engineer`
   - protocolo, sala, timers, bots, reconexión, replays, telemetría → `netcode-engineer`
   - escena, VFX, HUD, audio, tutorial, i18n, accesibilidad → `tech-artist`

   Si el paquete cruza fronteras, **trocéalo** y lanza uno por paquete de código, en serie si
   hay dependencia entre ellos. No mezcles «arregla esto y de paso añade aquello».

3. **Plan antes que código.** Pide plan en ≤10 líneas y espera mi OK antes de implementar.

4. **Criterios de aceptación.** Extráelos literalmente de la ficha del WP y conviértelos en
   una lista verificable, cada uno con el comando que lo demuestra. Si un criterio no es
   verificable con un comando o una captura, reescríbelo hasta que lo sea.

5. **Cierre.** Cuando el especialista termine, ejecuta `/verify`. Después lanza `wp-reviewer`
   sobre el diff. Si el revisor devuelve bloqueantes, vuelve al paso 3 con el alcance reducido.

6. **Ritual final:** salida de los tests pegada, self-review contra los I* y E* aplicables,
   deudas dejadas con su WP de destino, y entrada para `docs/decisiones.md` si procede.

Si $1 lleva más de dos sesiones sin llegar a verde, dilo y propón trocearlo: arrastrar
medio-código sale más caro que revertir y reencargar con menos alcance.
