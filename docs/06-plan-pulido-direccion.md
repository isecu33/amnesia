# 06 — Plan de pulido de dirección (2026-11-16)

> Dirección de juego para acercar TÓTEM a una producción profesional: efectos claros,
> timing legible, personajes vivos e interfaz coherente (pixel art 3D moderno, ref. Megabonk).
> Plataformas: móvil horizontal y escritorio, partidas online con amigos.

## Pilares de dirección
1. **Legibilidad primero.** Cada evento responde en ≤ 150 ms a QUIÉN hizo QUÉ a QUÉ casilla.
   Nunca solo color (daltonismo); siempre icono + nombre + sonido.
2. **Un efecto = una identidad.** Color, icono, leitmotiv y VFX propios por efecto
   (Vislumbre vela · Doble Robo ámbar · Espionaje cuervo · Ojo Compartido místico ·
   Trueque Ciego humo · Revuelo torbellino · Trueque Vidente chamán).
3. **La escena nunca se adelanta al servidor** y nunca come ventanas de reflejos
   (ventana de robo, Descarte Rápido).
4. **Personajes que reaccionan**: miran al que juega, se encogen al ser objetivo, celebran.
5. **Interfaz con cuerpo**: botones gruesos con bisel y pulsación, título animado,
   coherencia de paleta entre menús y mesa. Táctil ≥ 44 px, safe areas.

## Diagnóstico (auditoría)
- Efectos: solo SWAP tiene VFX en `EFFECT_RESOLVED`; `STEAL_WINDOW_OPENED`, `EFFECT_STOLEN`,
  `OMEN_CHANGED`, `CHAIN_BROKEN`, `DOUBLE_DRAW_*`, `WILD_GIFT` sin beat/sfx/subtítulo;
  `PRIVATE_REVEAL` y `pendingEffect` se aplican al recibir (antes de la animación);
  ventana de robo no urgente en la cola.
- Personajes: con rig GLB solo se ve `coger_carta`; mirada/poses invisibles; carrera de carga
  con plantilla compartida (rival invisible); sin reacción a ser objetivo ni a emotes.
- UI: título estático, Home es un formulario; sin safe areas ni `viewport-fit`; teclas mostradas
  en táctil; placa de turno tapa al rival en 812×375; mesa sobreexpuesta (glow 0.55 umbral 0.62
  + 4 luces cálidas sin tone mapping).

## Paquetes de trabajo (en paralelo, ficheros disjuntos)
| WP | Dueño | Ficheros |
|---|---|---|
| P1 Efectos y timing | agente efectos | `presenter/*`, `vfx/*`, `net/client.ts`, `state/subtitles.ts`, `audio/audio.ts`, `hud/EffectBanner.tsx`, `hud/effect-banner.css`, `ui/Table3D.tsx` (solo montaje del banner) |
| P2 Personajes | agente personajes | `scene/characters.ts`, `poses.ts`, `rig-models.ts`, `species.ts`, `world.ts` |
| P3 Título y menús | agente menús | `ui/Home.tsx`, `ui/PixelArt.tsx`, `ui/CharacterCarousel.tsx`, `ui/Lobby.tsx`, `ui/Score.tsx`, `ui/App.tsx`, `ui/styles.css`, `scene/backdrop.ts`, `index.html`, `server/src/session.ts`+`room.ts` (bots) |
| P4 HUD de mesa, móvil y luz | agente HUD | `hud/*` (salvo P1), `hud/hud.css`, `scene/postfx.ts`, `scene/maps/*`, `scene/map-builder.ts` |
`i18n/index.ts` compartido: cada WP añade claves es/en en su bloque comentado.

## Criterios de aceptación globales
- `pnpm -r typecheck && pnpm -r test` en verde; sin `any`; strings vía i18n.
- I2 intacto: ningún VFX/banner revela valores ocultos a quien no debe.
- «Menos movimiento» respetado: alternativa no cinética para todo lo nuevo.
- Verificado en 812×375 y 1280×800 con capturas.
