---
description: Registra una decisión en docs/decisiones.md con el formato ADR-lite del repo
argument-hint: <la decisión en una frase>
allowed-tools: Read, Edit, Grep, Glob
---

Registra esta decisión: **$ARGUMENTS**

1. Lee `docs/decisiones.md` y quédate con el formato exacto y el último número usado.
2. Comprueba si ya hay una entrada que la cubra o la contradiga. Si contradice a una anterior,
   **no la borres**: añade la nueva y marca la vieja como superada, con referencia cruzada.
3. Escribe la entrada nueva con el siguiente número libre. Debe contestar cuatro cosas:
   - **Qué** se decide, en una frase que se entienda dentro de seis meses.
   - **Por qué**: el problema real que lo motiva, no la justificación de despacho.
   - **Alternativas descartadas** y por qué se descartaron. Esta es la parte que la gente se
     salta y la única que sirve cuando alguien quiere revisar la decisión más tarde.
   - **Consecuencias**: qué queda peor o más limitado por haber decidido esto.
4. Si la decisión cambia una regla del juego o un contrato técnico, actualiza **también**
   `docs/01` o `docs/02`: los docs mandan sobre el código, así que una decisión que solo vive
   en el ADR no es normativa. Dime exactamente qué secciones tocaste.

Cero adorno. Una entrada ADR buena cabe en diez líneas.
