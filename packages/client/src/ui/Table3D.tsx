import { useEffect, useRef, useState } from 'react';
import type { ActionType, GameEvent, PlayerView } from '@totem/core';
import { act, sendEmote } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { World, type Intent } from '../scene/world.js';
import { Presenter } from '../presenter/queue.js';
import { Vfx } from '../vfx/sequences.js';
import { audio } from '../audio/audio.js';
import { applyEventToView } from '@totem/core';
import { Candle } from '../hud/Candle.js';
import { HeldCard } from '../hud/HeldCard.js';
import { Scoreboard } from '../hud/Scoreboard.js';
import { EmoteWheel } from '../hud/EmoteWheel.js';
import { Subtitles } from '../hud/Subtitles.js';
import { Stats } from '../hud/Stats.js';
import { LastHumanDialog } from '../hud/LastHumanDialog.js';

/** Intenciones legales derivadas de view.legal (docs/01 §11: solo lo legal brilla). */
export function legalIntents(view: PlayerView): Intent[] {
  const out: Intent[] = [];
  const can = (a: ActionType): boolean => view.legal.includes(a);
  if (can('DRAW_DECK')) out.push({ kind: 'deck' });
  if (can('DRAW_DISCARD')) out.push({ kind: 'discard' });
  if (can('CALL_ULTIMA')) out.push({ kind: 'bell' });
  if (can('MATCH_ATTEMPT') || can('SWAP_DRAWN') || can('PEEK_INITIAL')) {
    view.you.slots.forEach((s, i) => {
      if (s === 'hidden') out.push({ kind: 'slot', player: view.you.id, slot: i });
    });
  }
  if (can('EFFECT_TARGET')) {
    for (const o of view.others) {
      o.slots.forEach((s, i) => {
        if (s === 'hidden' && !o.sealed) out.push({ kind: 'slot', player: o.id, slot: i });
      });
    }
    view.you.slots.forEach((s, i) => {
      if (s === 'hidden') out.push({ kind: 'slot', player: view.you.id, slot: i });
    });
  }
  return out;
}

/** Traduce una intención de la escena a una acción de protocolo. */
export function intentToAction(
  view: PlayerView,
  intent: Intent,
  ctx: { peekPicks: number[]; swapArmed: boolean; swapSource: number | null },
): { action?: Parameters<typeof act>[0]; peekToggle?: number; swapSource?: number } {
  const can = (a: ActionType): boolean => view.legal.includes(a);
  if (intent.kind === 'deck' && can('DRAW_DECK')) return { action: { t: 'DRAW_DECK' } };
  if (intent.kind === 'discard' && can('DRAW_DISCARD')) return { action: { t: 'DRAW_DISCARD' } };
  if (intent.kind === 'bell' && can('CALL_ULTIMA')) return { action: { t: 'CALL_ULTIMA' } };
  if (intent.kind !== 'slot') return {};

  const mine = intent.player === view.you.id;
  if (can('PEEK_INITIAL') && mine) return { peekToggle: intent.slot };
  if (can('EFFECT_TARGET')) {
    if (mine && ctx.swapSource === null && view.phase === 'EFFECT_TARGETING') {
      // Vislumbre propio, o primera mitad del Trueque.
      return {
        action: { t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: intent.slot } },
        swapSource: intent.slot,
      };
    }
    if (!mine && ctx.swapSource !== null) {
      return {
        action: {
          t: 'EFFECT_TARGET',
          target: {
            kind: 'SWAP',
            ownSlot: ctx.swapSource,
            player: intent.player,
            theirSlot: intent.slot,
          },
        },
      };
    }
    if (!mine) {
      return {
        action: {
          t: 'EFFECT_TARGET',
          target: { kind: 'SPY', player: intent.player, slot: intent.slot },
        },
      };
    }
  }
  if (mine && ctx.swapArmed && can('SWAP_DRAWN'))
    return { action: { t: 'SWAP_DRAWN', slot: intent.slot } };
  if (mine && can('MATCH_ATTEMPT')) return { action: { t: 'MATCH_ATTEMPT', slot: intent.slot } };
  return {};
}

export function Table3D(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>();
  const vfxRef = useRef<Vfx>();
  const presenterRef = useRef<Presenter>();
  const localView = useRef<PlayerView | undefined>(undefined);

  const view = useStore((s) => s.view);
  const names = useStore((s) => s.names);
  const queue = useStore((s) => s.queue);
  const shiftEvent = useStore((s) => s.shiftEvent);
  const settings = useSettings();
  const t = makeT(settings.lang);

  const [world, setWorld] = useState<World | undefined>(undefined);
  const [peekPicks, setPeekPicks] = useState<number[]>([]);
  const [swapArmed, setSwapArmed] = useState(false);
  const [swapSource, setSwapSource] = useState<number | null>(null);

  // El <canvas> solo existe cuando ya hay vista: sin esta dependencia, si el
  // snapshot llega después del primer render la escena no se montaba nunca.
  const hasView = view !== undefined;

  // --- montaje de la escena ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!hasView || !canvas) return;
    const world = new World(canvas, {
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
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
      },
      play: (e, beat) => {
        if (beat.sfx) audio.play(beat.sfx);
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
      if (localView.current) world.update(localView.current, useStore.getState().names);
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
  }, [hasView]);

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
    });
    vfxRef.current?.setContext({
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
    });
  }, [settings.colorBlind, settings.reducedMotion]);

  // --- resaltado de lo legal ---
  useEffect(() => {
    if (view) worldRef.current?.highlight(legalIntents(view));
  }, [view]);

  if (!view) return <main className="panel">{t('loading')}</main>;

  const onCanvasClick = (ev: React.MouseEvent<HTMLCanvasElement>): void => {
    audio.unlock();
    const intent = worldRef.current?.pick(ev.clientX, ev.clientY);
    if (!intent) return;
    const r = intentToAction(view, intent, { peekPicks, swapArmed, swapSource });
    if (r.peekToggle !== undefined) {
      setPeekPicks((p) =>
        p.includes(r.peekToggle as number)
          ? p.filter((x) => x !== r.peekToggle)
          : [...p, r.peekToggle as number],
      );
      return;
    }
    if (r.swapSource !== undefined) setSwapSource(r.swapSource);
    if (r.action) {
      act(r.action);
      setSwapArmed(false);
      setSwapSource(null);
    }
  };

  const can = (a: ActionType): boolean => view.legal.includes(a);

  return (
    <main className="table3d">
      <canvas ref={canvasRef} onClick={onCanvasClick} aria-label={t('yourTotems')} />
      <div className="hud">
        <Scoreboard view={view} names={names} />
        <Candle view={view} />
        <HeldCard view={view} />
        <div className="hud-status">
          {view.activePlayer === view.you.id ? t('yourTurn') : t('waitingTurn')}
          {view.you.lockedForMs > 0
            ? ` · ${t('locked')} ${Math.ceil(view.you.lockedForMs / 1000)}s`
            : ''}
        </div>
        <div className="hud-actions">
          {can('PEEK_INITIAL') ? (
            <button
              disabled={peekPicks.length === 0}
              onClick={() => {
                act({ t: 'PEEK_INITIAL', slots: peekPicks });
                setPeekPicks([]);
              }}
            >
              {t('confirmPeek')} ({peekPicks.length})
            </button>
          ) : null}
          {can('DISCARD_DRAWN') ? (
            <button onClick={() => act({ t: 'DISCARD_DRAWN' })}>{t('discardDrawn')}</button>
          ) : null}
          {can('SWAP_DRAWN') ? (
            <button className={swapArmed ? 'active' : ''} onClick={() => setSwapArmed((v) => !v)}>
              {t('swapHint')}
            </button>
          ) : null}
          {can('EFFECT_SKIP') ? (
            <button onClick={() => act({ t: 'EFFECT_SKIP' })}>{t('skipEffect')}</button>
          ) : null}
          <EmoteWheel onEmote={sendEmote} />
        </div>
        <Subtitles />
        <Stats world={world} />
      </div>
      <LastHumanDialog />
    </main>
  );
}
