---
description: Auditoría de conformidad y de fugas antes de cerrar una fase o publicar
argument-hint: [área opcional: core | server | client | todo]
---

Auditoría de **$ARGUMENTS** (si está vacío: todo el repo).

Lanza en paralelo, cada uno con su alcance:

1. `rules-auditor` — matriz E1–E22 / I1–I10: implementado, testeado de verdad, o humo.
2. `leak-hunter` — por dónde se puede hacer trampa (I2), desde la semilla hasta el DOM.

Cuando devuelvan, **no me pegues los dos informes seguidos**. Sintetiza:

- Lo que está realmente cerrado, en una línea.
- Los hallazgos, deduplicados y ordenados por impacto en una partida real con amigos, no por
  elegancia técnica. Un dato que permite hacer trampa va por delante de un refactor.
- Para cada hallazgo: fichero:línea, cómo se manifiesta jugando, y el arreglo.
- Las contradicciones entre ambos informes, explícitas. Si uno dice que E13 está cubierto y el
  otro encuentra una fuga por ahí, eso es información, no ruido: no la promedies.

Cierra con las tres cosas que arreglarías primero y por qué, y qué quedó **sin** auditar.
