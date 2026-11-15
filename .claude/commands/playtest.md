---
description: Prepara una sesión de playtest y convierte lo que salga en tests de regresión
argument-hint: [antes | despues]
---

Fase: **$ARGUMENTS** (por defecto: `antes`).

## Si es `antes`

Deja la partida lista para jugar con gente de verdad, y dime en un bloque corto:

1. Que la batería está en verde (`/verify`) y el cliente construye.
2. Los valores actuales de la tabla de config (`core/src/config.ts`) que vais a estar
   probando, con su rango válido, para poder tocarlos entre partidas sin recompilar.
3. Dónde caen los replays (`REPLAY_DIR`) y cómo se verifican después.
4. La checklist de docs/03 §9 en versión corta, marcada con lo que ya se puede dar por hecho.
5. Qué observar concretamente esta sesión. Recuerda el gate de diversión de F3: si el juego no
   engancha, ningún efecto visual lo va a arreglar. Preguntas útiles: ¿alguien se aburre
   esperando su turno?, ¿el Descarte Rápido genera tensión o frustración?, ¿alguien entendió
   ÚLTIMA sin que se lo explicaran?

## Si es `despues`

Te doy notas en crudo de la sesión. Conviértelas en trabajo:

1. Separa **bugs** de **balance**. Son cosas distintas y se arreglan distinto: el bug va a
   código, el balance va a la tabla de config (y al doc 01 §9 **primero**).
2. Por cada bug, localiza el replay que lo contiene, verifícalo con `pnpm replay <fichero>`, y
   escribe un **test de regresión** que falle hoy. Sin test, el bug volverá.
3. Por cada ajuste de balance, propón el valor nuevo con el razonamiento, actualiza
   `docs/01` §9 y luego `config.ts`, y registra un ADR. Nunca al revés.
4. Ordena todo por impacto en la diversión, no por dificultad.

No suavices el feedback. Si tres personas dijeron que una mecánica es confusa, escríbelo tal
cual: los playtests solo sirven si el resultado incómodo llega entero.
