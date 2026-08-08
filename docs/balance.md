# Guía de balance y playtest (WP-17)

> **Regla nº 1:** el balance se toca SOLO en la tabla de `docs/01 §9`. Primero se
> edita el doc, luego `packages/core/src/config.ts`. Nunca un número suelto en el
> código.

## Métricas que se revisan (telemetría de docs/02 §8)

`GameSession.telemetry` expone contadores agregados y ratios. Ninguno lleva datos
personales: solo números.

| Ratio | Qué mide | Rango sano orientativo |
|---|---|---|
| `matchHitRate` | aciertos / intentos de Descarte Rápido | 0,45 – 0,70 |
| `matchFailRate` | fallos / intentos | 0,20 – 0,45 |
| `ultimaSuccessRate` | ÚLTIMAs que salen bien | 0,35 – 0,60 |
| `roundsPerGame` | rondas por partida en Clásico a 100 | 4 – 8 |
| `avgGameMs` | duración media | 15 – 25 min (pilar nº 4) |
| `emptyAltarRate` | rondas ganadas por altar vacío | 0,05 – 0,20 |

## Palancas y su efecto

| Síntoma | Palanca (docs/01 §9) | Dirección |
|---|---|---|
| El Descarte Rápido casi no se usa | `matchFailPenaltyCards`, `matchFailLockoutSeconds` | bajar |
| Se abusa del Descarte Rápido a ciegas | `fullHandPenaltyPoints`, `matchFailLockoutSeconds` | subir |
| Las partidas se eternizan | `gameEndScore` | bajar |
| ÚLTIMA se canta siempre | `ultimaFailPenaltyPoints` | subir |
| ÚLTIMA no se canta nunca | `ultimaFailPenaltyPoints`, `ultimaMinOrbit` | bajar |
| Vaciar el altar es demasiado fuerte | `emptyAltarBonusPoints` | acercar a 0 |
| Los turnos se sienten lentos | `turnSeconds`, `effectTargetSeconds` | bajar |
| Los nuevos no se enteran | `privateRevealSeconds`, `initialPeekSeconds` | subir |

## Ciclo de playtest

1. Sesión guiada con 4–6 personas, modo Clásico a 100.
2. Revisar la línea `telemetry` del log del servidor al terminar.
3. Cada bug encontrado → coger su replay de `replays/` → `pnpm replay <fichero>`.
4. Si el replay reproduce el fallo, se añade al repo como test de regresión
   (`packages/server/src/telemetry.test.ts` tiene el patrón).
5. Los ajustes de balance se registran en `docs/decisiones.md`.

## Checklist «listo para jugar con amigos» (docs/03 §9)

- [ ] Crear sala, compartir código, 4 personas dentro en < 1 min
- [ ] Partida Clásico a 100 completa sin desync ni bug bloqueante
- [ ] Las 3 mecánicas de efecto + match + ÚLTIMA con animación y sonido
- [ ] Bots rellenan huecos y sustituyen desconexiones
- [ ] Reconexión en < 10 s recupera la partida
- [ ] Tutorial completable por alguien que no ha leído nada
- [ ] 60 fps en un portátil normal
- [ ] Replay de cada partida guardado y verificable con `pnpm replay`
