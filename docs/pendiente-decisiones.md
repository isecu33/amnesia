# Decisiones pendientes (revisión de UI, 2026-10-26)

No implementadas. Cada una lleva opción recomendada; al decidir, registrar en `decisiones.md`.

1. **Doble sentido de «tótem»** (animal-avatar vs cartas propias).
   Recomendado: mantener «tótem» para las cartas (es el nombre del juego y del GDD) y llamar «animal» al avatar ("Elige tu animal"; ya existe `yourAnimal`).
2. **Fuente pixel real** en lugar de Courier New (asset nuevo: requiere entrada en `decisiones.md`).
   Recomendado: fuente pixel libre (p. ej. Silkscreen o Pixelify Sans, OFL) autoalojada con `@font-face`, solo en títulos y botones; cuerpo legible aparte.
3. **Tamaño de los personajes 3D** y distancia de las acciones a las cartas.
   Recomendado: reducir ~20-25 % la escala de los rivales y acercar la cámara a la fila propia; validar con captura en 1440x900 antes de fijar.
4. **Nombres en inglés de efectos** (Peek/Spy/Blind Swap) añadidos por un subagente.
   Recomendado: derivarlos del GDD (§ efectos) y mantener es/en con una única fuente en `i18n`; confirmar el glosario en `GLOSSARY.md`.
