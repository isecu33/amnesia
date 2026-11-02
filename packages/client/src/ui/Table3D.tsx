import { useEffect, useRef, useState } from 'react';
import type { GameEvent, PlayerView, SlotRef } from '@totem/core';
import { applyEventToView } from '@totem/core';
import { act, sendEmote } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { World, type Intent } from '../scene/world.js';
import type { CameraPoseId } from '../scene/layout.js';
import { Presenter } from '../presenter/queue.js';
import { Vfx } from '../vfx/sequences.js';
import { audio } from '../audio/audio.js';
import { HudModel } from '../presenter/hud-model.js';
import { deriveHudV2 } from '../presenter/hud-v2.js';
import { LogScroll } from '../hud/LogScroll.js';
import { EmoteWheel } from '../hud/EmoteWheel.js';
import { Subtitles } from '../hud/Subtitles.js';
import { Stats } from '../hud/Stats.js';
import { LastHumanDialog } from '../hud/LastHumanDialog.js';
import { SeatLabels } from '../hud/SeatLabels.js';
import { actionList, moveSelection, type ActionEntry } from '../hud/slot-bar.js';
import { cycleRival, rivalSlotIntent } from './keyboard-target.js';
import {
  canTargetRival,
  doubleDrawKeepAction,
  doubleDrawKeyIndex,
  effectHintKey,
  intentToAction,
  legalIntents,
} from './effect-targeting.js';
import { EffectHint } from '../hud/EffectHint.js';
import { DoubleDrawChoice } from '../hud/DoubleDrawChoice.js';

/** Píxeles que separan un clic de un arrastre de cámara. */
const DRAG_SLOP_PX = 6;

export function Table3D(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>();
  const vfxRef = useRef<Vfx>();
  const presenterRef = useRef<Presenter>();
  const localView = useRef<PlayerView | undefined>(undefined);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hudModel = useRef(new HudModel());
  /** Duración de la ventana de Robo de la sala, leída por el bucle de render. */
  const stealTotalMs = useRef<number | undefined>(undefined);
  /** Lo que la HUD diegética necesita del estado de la interfaz, leído cada frame. */
  const hudCtx = useRef<{
    selected?: number;
    picks: number[];
    swapArmed: boolean;
    targeting: boolean;
  }>({
    picks: [],
    swapArmed: false,
    targeting: false,
  });

  const view = useStore((s) => s.view);
  const names = useStore((s) => s.names);
  const queue = useStore((s) => s.queue);
  const lobby = useStore((s) => s.lobby);
  const reveal = useStore((s) => s.reveal);
  /** Efecto en curso: la vista lo trae (y el paso del Vidente); EFFECT_PENDING cubre el resto. */
  const pendingEffect = useStore((s) => s.pendingEffect);
  const effect = view?.effect?.kind ?? pendingEffect;
  const effectStep = view?.effect?.step;
  /** Modo Salvaje: se puede igualar sobre tótems de rivales. */
  const wild = lobby?.config.wildModeEnabled === true;
  const shiftEvent = useStore((s) => s.shiftEvent);
  const settings = useSettings();
  const t = makeT(settings.lang);

  const [world, setWorld] = useState<World | undefined>(undefined);
  const [peekPicks, setPeekPicks] = useState<number[]>([]);
  const [swapArmed, setSwapArmed] = useState(false);
  const [swapSource, setSwapSource] = useState<number | null>(null);
  /** Revuelo: primera casilla elegida (propia o de rival). */
  const [rumbleFirst, setRumbleFirst] = useState<SlotRef | null>(null);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  /** Rival elegido con Q/W para apuntar con el teclado (Espionaje/Trueque). */
  const [targetRival, setTargetRival] = useState<string | undefined>(undefined);
  const [, setPoseState] = useState<CameraPoseId>('table');
  /** El registro (pergamino) solo se ve mientras se mantiene L. */
  const [showLog, setShowLog] = useState(false);

  // El <canvas> solo existe cuando ya hay vista: sin esta dependencia, si el
  // snapshot llega después del primer render la escena no se montaba nunca.
  const hasView = view !== undefined;
  /** Mapa de la partida (D-044): fijo durante la partida, cambia solo en la revancha. */
  const mapId = lobby?.map;

  // --- montaje de la escena ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!hasView || !canvas) return;
    const px = Number(new URLSearchParams(globalThis.location?.search ?? '').get('px'));
    const world = new World(canvas, {
      ...(mapId ? { mapId } : {}),
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
      bigNumbers: settings.bigNumbers,
      // `?px=` manda sobre el ajuste (útil para medir); si no, el ajuste del usuario.
      pixelHeight: Number.isFinite(px) && px > 0 && px <= 2160 ? px : settings.pixelHeight,
    });
    const vfx = new Vfx({
      world,
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
      youId: view?.you.id ?? '',
    });
    const presenter = new Presenter({
      advance: (e: GameEvent) => {
        if (localView.current) localView.current = applyEventToView(localView.current, e);
        hudModel.current.onEvent(e, localView.current ? localView.current.others.length + 1 : 2);
      },
      trim: () => world.trimWeight(),
      play: (e, beat) => {
        if (beat.sfx) audio.play(beat.sfx);
        world.react(e);
        if (beat.vfx) vfx.play(beat.vfx, e);
        // La música sube de intensidad tras cantarse ÚLTIMA (docs/01 §12).
        if (e.e === 'ULTIMA_CALLED') audio.setIntensity('tense');
        if (e.e === 'ROUND_STARTED') audio.setIntensity('calm');
      },
      fastForward: () => {
        // Cola desbordada: saltamos al snapshot del servidor (docs/02 §5.2).
        const v = useStore.getState().view;
        if (v) {
          localView.current = v;
          world.update(v, useStore.getState().names);
        }
      },
    });
    worldRef.current = world;
    vfxRef.current = vfx;
    presenterRef.current = presenter;
    setWorld(world);
    // Solo en desarrollo: medir `world.stats` (docs/02 §5.3) desde la consola.
    if (import.meta.env.DEV) (globalThis as { __totemWorld?: World }).__totemWorld = world;
    // Ambiente nocturno + música (docs/01 §12). Requiere gesto previo del usuario.
    audio.startAmbient();

    let raf = 0;
    let last = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = last ? now - last : 16;
      last = now;
      presenter.tick(now);
      vfx.update(dt);
      if (localView.current) {
        world.update(localView.current, useStore.getState().names);
        const latest = useStore.getState().view ?? localView.current;
        world.setHud(
          hudModel.current.frame({
            view: localView.current,
            clockView: latest,
            nowMs: now,
            ctx: hudCtx.current,
            v2: deriveHudV2(
              localView.current,
              stealTotalMs.current === undefined ? {} : { stealTotalMs: stealTotalMs.current },
            ),
          }),
        );
      }
      world.render(now);
    };
    raf = requestAnimationFrame(loop);
    const onResize = (): void => world.resize();
    globalThis.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener('resize', onResize);
      vfx.dispose();
      world.dispose();
      audio.stopAmbient();
    };
    // Deliberado: la escena se monta una vez (al aparecer el canvas) y se
    // actualiza por el bucle; opciones y youId se aplican por otros efectos.
    // Solo el mapa la remonta: una revancha puede traer otro (D-044).
  }, [hasView, mapId]);

  // --- snapshots y cola ---
  useEffect(() => {
    if (!view) return;
    if (!localView.current) localView.current = view;
    worldRef.current?.update(localView.current, names);
  }, [view, names]);

  useEffect(() => {
    const p = presenterRef.current;
    if (!p) return;
    let e = shiftEvent();
    while (e) {
      p.enqueue(e);
      e = shiftEvent();
    }
  }, [queue, shiftEvent]);

  useEffect(() => {
    worldRef.current?.setOptions({
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
      bigNumbers: settings.bigNumbers,
      pixelHeight: settings.pixelHeight,
    });
    vfxRef.current?.setContext({
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
    });
  }, [settings.colorBlind, settings.reducedMotion, settings.bigNumbers, settings.pixelHeight]);

  // Avatares del lobby → animal de cada personaje.
  useEffect(() => {
    if (!world || !lobby) return;
    world.setSeats(
      Object.fromEntries(
        lobby.seats.map((s) => [s.playerId, { avatar: s.avatar, species: s.species }]),
      ),
    );
  }, [world, lobby]);

  // Vista privada (Vislumbre / Espionaje): la carta 3D se ve de cara solo aquí.
  useEffect(() => {
    world?.setReveal(
      reveal ? { player: reveal.player, slot: reveal.slot, value: reveal.value } : undefined,
    );
  }, [world, reveal]);

  // --- resaltado de lo legal ---
  const selectedIntent: Intent | undefined =
    view && selected !== undefined
      ? { kind: 'slot', player: view.you.id, slot: selected }
      : undefined;
  useEffect(() => {
    if (view)
      worldRef.current?.highlight(
        legalIntents(view, effect, { wild, rumbleFirst }),
        selectedIntent,
      );
  }, [view, world, selected, effect, wild, rumbleFirst]);

  // Al acabar el efecto se sueltan el slot de origen del Trueque y el rival del teclado.
  useEffect(() => {
    if (!view?.legal.includes('EFFECT_TARGET')) {
      setSwapSource(null);
      setRumbleFirst(null);
    }
  }, [view]);

  // El rival apuntado con Q/W se suelta solo cuando ya no se puede apuntar (en Salvaje
  // EFFECT_TARGET nunca es legal, y los snapshots llegan tras cada acción de cualquiera).
  useEffect(() => {
    if (!view || !canTargetRival(view, effect, wild)) setTargetRival(undefined);
  }, [view, effect, wild]);

  // Al pasar del paso 1 al 2 del Vidente se olvida lo que se hubiera marcado.
  useEffect(() => {
    setSwapSource(null);
  }, [effectStep]);

  // Un slot elegido que deja de existir o de estar ocupado se suelta.
  useEffect(() => {
    if (selected !== undefined && view?.you.slots[selected] !== 'hidden') setSelected(undefined);
  }, [view, selected]);

  stealTotalMs.current = lobby?.config.stealWindowMs;
  hudCtx.current = {
    ...(selected === undefined ? {} : { selected }),
    picks: peekPicks,
    swapArmed,
    targeting: !!view && canTargetRival(view, effect, wild),
  };

  // --- acciones ---
  const runIntent = (intent: Intent): void => {
    if (!view) return;
    const r = intentToAction(view, intent, {
      peekPicks,
      swapArmed,
      swapSource,
      effect,
      step: effectStep,
      rumbleFirst,
      wild,
    });
    if (r.peekToggle !== undefined) {
      const slot = r.peekToggle;
      setPeekPicks((p) => (p.includes(slot) ? p.filter((x) => x !== slot) : [...p, slot]));
      return;
    }
    if (r.swapSource !== undefined) setSwapSource(r.swapSource);
    if (r.rumbleFirst !== undefined) setRumbleFirst(r.rumbleFirst);
    if (r.action) {
      act(r.action);
      setSwapArmed(false);
      setSwapSource(null);
      setRumbleFirst(null);
    }
  };

  const runAction = (a: ActionEntry): void => {
    if (!view || !view.legal.includes(a.id)) return;
    audio.unlock();
    switch (a.id) {
      case 'DRAW_DECK':
        return act({ t: 'DRAW_DECK' });
      case 'DRAW_DISCARD':
        return act({ t: 'DRAW_DISCARD' });
      case 'DISCARD_DRAWN':
        return act({ t: 'DISCARD_DRAWN' });
      case 'SWAP_DRAWN':
        // Con un slot ya elegido en la barra, S sustituye directamente.
        if (selected !== undefined && view.you.slots[selected] === 'hidden') {
          act({ t: 'SWAP_DRAWN', slot: selected });
          setSwapArmed(false);
          return;
        }
        return setSwapArmed((v) => !v);
      case 'EFFECT_SKIP':
        return act({ t: 'EFFECT_SKIP' });
      case 'CALL_ULTIMA':
        return act({ t: 'CALL_ULTIMA' });
      case 'PEEK_INITIAL':
        if (peekPicks.length === 0) return;
        act({ t: 'PEEK_INITIAL', slots: peekPicks });
        return setPeekPicks([]);
      default:
        return;
    }
  };

  const pickSlot = (slot: number): void => {
    audio.unlock();
    setSelected(slot);
    if (view) runIntent({ kind: 'slot', player: view.you.id, slot });
  };

  const keepDoubleDraw = (index: number): void => {
    const a = view ? doubleDrawKeepAction(view, index) : undefined;
    if (!a) return;
    audio.unlock();
    act(a);
  };

  const togglePose = (): void => {
    const w = worldRef.current;
    if (w) setPoseState(w.togglePose());
  };

  // --- teclado (docs/01 §11): 1–8, A/D + E, acciones con tecla, Space, flechas ---
  useEffect(() => {
    if (!view) return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      const target = ev.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      const k = ev.key.toLowerCase();
      // Un botón enfocado conserva Espacio/Enter (activarlo) en vez de girar la cámara.
      if (target?.tagName === 'BUTTON' && (k === ' ' || k === 'enter')) return;
      if (k === ' ') {
        ev.preventDefault();
        togglePose();
        return;
      }
      if (k === 'l') {
        setShowLog(true);
        return;
      }
      if (k === 'arrowleft' || k === 'arrowright') {
        worldRef.current?.nudgeYaw(k === 'arrowleft' ? 1 : -1);
        return;
      }
      // Q/W/Esc solo tienen sentido si el efecto admite rival (Espionaje o Trueque).
      const targeting = canTargetRival(view, effect, wild);
      if (targeting && (k === 'q' || k === 'w')) {
        setTargetRival((r) => cycleRival(view, r, k === 'w' ? 1 : -1));
        return;
      }
      if (targeting && k === 'escape') {
        setTargetRival(undefined);
        setSwapSource(null);
        setRumbleFirst(null);
        return;
      }
      const keepIndex = doubleDrawKeyIndex(k);
      if (keepIndex !== undefined) {
        keepDoubleDraw(keepIndex);
        return;
      }
      if (/^[1-8]$/.test(k)) {
        const slot = Number(k) - 1;
        const rivalIntent = targeting ? rivalSlotIntent(view, targetRival, slot) : undefined;
        if (rivalIntent) {
          audio.unlock();
          runIntent(rivalIntent);
          setTargetRival(undefined);
        } else if (!targetRival && view.you.slots[slot] === 'hidden') pickSlot(slot);
        return;
      }
      if (k === 'a' || k === 'd') {
        setSelected((s) => moveSelection(view, s, k === 'd' ? 1 : -1));
        return;
      }
      if (k === 'e') {
        if (selected !== undefined) pickSlot(selected);
        return;
      }
      const entry = actionList(view).find((a) => a.key === k);
      if (entry) {
        ev.preventDefault();
        runAction(entry);
      }
    };
    const onKeyUp = (ev: KeyboardEvent): void => {
      if (ev.key.toLowerCase() === 'l') setShowLog(false);
    };
    const onBlur = (): void => setShowLog(false);
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('keyup', onKeyUp);
    globalThis.addEventListener('blur', onBlur);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('keyup', onKeyUp);
      globalThis.removeEventListener('blur', onBlur);
    };
  });

  if (!view) return <main className="panel">{t('loading')}</main>;

  /** Tocar una tecla grabada en la mesa equivale a pulsarla (móvil y ratón). */
  const pressKey = (key: string): void => {
    audio.unlock();
    if (key === 'l') return setShowLog((v) => !v);
    const targeting = canTargetRival(view, effect, wild);
    if (targeting && (key === 'q' || key === 'w')) {
      return setTargetRival((r) => cycleRival(view, r, key === 'w' ? 1 : -1));
    }
    const entry = actionList(view).find((a) => a.key === key);
    if (entry) runAction(entry);
  };

  // --- puntero: clic = intención; arrastre = cámara ---
  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>): void => {
    dragRef.current = { x: ev.clientX, y: ev.clientY, moved: false };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    d.moved = true;
    const w = worldRef.current;
    if (w) setPoseState(w.drag(dx, dy));
  };
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = dragRef.current;
    dragRef.current = null;
    worldRef.current?.release();
    if (d?.moved) return;
    audio.unlock();
    const intent = worldRef.current?.pick(ev.clientX, ev.clientY);
    if (!intent) return;
    if (intent.kind === 'key') return pressKey(intent.key);
    if (intent.kind === 'slot' && intent.player === view.you.id) setSelected(intent.slot);
    runIntent(intent);
  };

  return (
    <main className="table3d">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          worldRef.current?.release();
        }}
        aria-label={t('yourTotems')}
      />
      <SeatLabels world={world} view={view} names={names} targetRival={targetRival} />
      <div className="hud">
        <EffectHint
          hintKey={effectHintKey(view, { effect, step: effectStep, swapSource, rumbleFirst })}
          lang={settings.lang}
        />
        <DoubleDrawChoice view={view} onKeep={keepDoubleDraw} />
        <Subtitles />
        <div className="hud-bottom-left">
          <EmoteWheel onEmote={sendEmote} />
        </div>
        {showLog ? <LogScroll view={view} names={names} /> : null}
        <Stats world={world} />
      </div>
      <div className="rotate-hint" role="alert">
        {t('rotateDevice')}
      </div>
      <LastHumanDialog />
    </main>
  );
}
