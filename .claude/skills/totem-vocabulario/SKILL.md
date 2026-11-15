---
name: totem-vocabulario
description: Vocabulario canónico de TÓTEM — fases, acciones, eventos, casos E1-E22 e invariantes I1-I10. Úsalo siempre que escribas código, tests, mensajes de commit o documentación del juego, y cuando dudes de cómo se llama algo o de dónde vive una regla.
---

# Vocabulario canónico de TÓTEM

La deriva de nombres es el bug silencioso número uno en un proyecto llevado con agentes: dos
sesiones inventan dos nombres para lo mismo, los tests dejan de encontrarse con los docs, y
nadie sabe ya si un caso está cubierto. Esta skill existe para que eso no pase.

**Regla de oro:** los nombres los fijan los docs, no el código y no tú. Si necesitas un
concepto nuevo, nómbralo en `docs/01` o `docs/02` primero.

## Dónde vive cada cosa

| Necesitas… | Está en |
|---|---|
| Reglas del juego (normativas) | `docs/01-gdd-y-reglas-totem.md` §3–§10 |
| Casos límite **E1–E22** | `docs/01` §10 |
| Tabla de configuración y rangos | `docs/01` §9 |
| Tabla de feedback: duraciones y animaciones | `docs/01` §11 |
| Paleta y estilo visual | `docs/01` §12 |
| Tipos, API, acciones y eventos | `docs/02-arquitectura-tecnica.md` §3 |
| Invariantes **I1–I10** | `docs/02` §3.8 |
| Protocolo C2S/S2C y sala | `docs/02` §4 |
| Seguridad y anti-trampas | `docs/02` §6 |
| Cliente, cola de animación, presupuesto de render | `docs/02` §5 |
| Plan por paquetes de trabajo WP-00…WP-17 | `docs/03-plan-y-guia-agentes.md` §5 |
| Decisiones tomadas (ADR-lite) | `docs/decisiones.md` |

Antes de afirmar cómo funciona una regla, **léela**. No la reconstruyas de memoria a partir
del código: si código y doc discrepan, manda el doc y el código es un bug.

## Cómo se citan las cosas

- En comentarios y tests, referencia el caso o invariante por su código —`E5`, `I2`— en vez de
  re-explicar la regla. La explicación vive en el doc; el código apunta a ella.
- Nombra los tests con el código delante: `describe('E13 · mano llena', …)`.
- Commits convencionales con el paquete: `feat(core): …`, `fix(server): …`, `test(client): …`.
- Un cambio de forma de mensaje entre cliente y servidor exige bump de `PROTOCOL_VERSION`.

## Los conceptos que más se confunden

- **Tótem** es la carta física del jugador; **slot** es la posición donde vive. Un slot vaciado
  queda como hueco (`null`) y **jamás se compacta** (E21): el índice es parte de la memoria del
  jugador, moverlo sería cambiar el juego.
- **Descarte Rápido** (el match), no «descarte» a secas: descartar es otra acción distinta del
  turno normal.
- **ÚLTIMA** se *canta*, y al cantarla el jugador queda *sellado*.
- **Vislumbre** es la mirada inicial a tus propios tótems; **Espionaje** es mirar los de otro.
  No son intercambiables aunque ambos «revelen».
- **Trueque Ciego** intercambia sin que nadie vea el valor.
- **Órbita** es una vuelta completa de turnos, la unidad en la que se miden condiciones como
  `ultimaMinOrbit`.
- **Controlador** (`human` | `bot`) es quién opera un asiento; el asiento no desaparece cuando
  su humano se cae (E16, E18), lo toma un bot.
- **tick** es tiempo del servidor inyectado en `core`; `core` nunca lee el reloj por su cuenta.

## Antes de dar algo por terminado

Comprueba que no has inventado sinónimos. Si has escrito «carta del jugador» donde el doc dice
«tótem», o «penalización» donde dice «castigo», renómbralo ahora: dentro de tres sesiones
costará diez veces más y alguien acabará implementando dos veces la misma regla con dos nombres.
