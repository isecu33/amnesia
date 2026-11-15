import { useEffect, useRef, useState } from 'react';
import type { GameEvent, PlayerView } from '@totem/core';
import { World } from '../scene/world.js';
import { Vfx, type SequenceId } from '../vfx/sequences.js';
import { audio } from '../audio/audio.js';
import { beatFor } from '../presenter/timelines.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT } from '../i18n/index.js';

/** Escena de depuración de WP-11: dispara cada secuencia con datos falsos. */
const FAKE_VIEW: PlayerView = {
  you: {
    id: 'you',
    slots: ['hidden', 'hidden', 'hidden', 'hidden'],
    sealed: false,
    lockedForMs: 0,
  },
  others: [
    { id: 'r1', slots: ['hidden', 'hidden', 'hidden', 'hidden'], sealed: false, controller: 'bot' },
    { id: 'r2', slots: ['hidden', 'empty', 'hidden', 'hidden'], sealed: false, controller: 'bot' },
  ],
  discardTop: 7,
  deckCount: 30,
  phase: 'TURN_DRAW',
  activePlayer: 'you',
  orbit: 2,
  timers: [],
  scores: { you: { total: 0 }, r1: { total: 0 }, r2: { total: 0 } },
  legal: [],
  tick: 0,
};

const SEQUENCES: { id: SequenceId; event: GameEvent }[] = [
  { id: 'drawDeck', event: { e: 'DREW', player: 'you', source: 'deck' } },
  { id: 'discard', event: { e: 'DISCARDED_DRAWN', player: 'you', value: 7 } },
  { id: 'swap', event: { e: 'SWAPPED_DRAWN', player: 'you', slot: 1, discardedValue: 3 } },
  {
    id: 'peek',
    event: { e: 'PRIVATE_REVEAL', to: 'you', player: 'you', slot: 0, value: 7, ttlMs: 3000 },
  },
  {
    id: 'spy',
    event: { e: 'PRIVATE_REVEAL', to: 'you', player: 'r1', slot: 2, value: 9, ttlMs: 3000 },
  },
  {
    id: 'blindSwap',
    event: {
      e: 'EFFECT_RESOLVED',
      player: 'you',
      effect: 'SWAP',
      publicInfo: {
        slots: [
          { player: 'you', slot: 0 },
          { player: 'r1', slot: 1 },
        ],
      },
    },
  },
  { id: 'matchOk', event: { e: 'MATCH_OK', player: 'you', slot: 2, value: 7 } },
  {
    id: 'matchFail',
    event: { e: 'MATCH_FAIL', player: 'you', slot: 3, value: 2, penalty: 'card' },
  },
  { id: 'ultima', event: { e: 'ULTIMA_CALLED', player: 'you' } },
  { id: 'reveal', event: { e: 'ROUND_REVEAL', hands: {} } },
  { id: 'penalty', event: { e: 'PENALTY_CARD', player: 'r1', slot: 3 } },
  { id: 'reject', event: { e: 'MATCH_REJECTED', player: 'you', reason: 'tooLate' } },
  { id: 'chain', event: { e: 'CHAIN_LINK', player: 'you', link: 3, bonus: 1 } },
  { id: 'steal', event: { e: 'EFFECT_STOLEN', thief: 'r1', owner: 'you', effect: 'PEEK' } },
  { id: 'shuffle', event: { e: 'DECK_RESHUFFLED', deckCount: 30 } },
  { id: 'victory', event: { e: 'GAME_ENDED', winner: 'you', totals: {} } },
];

/** Separación entre secuencias en «reproducir todo» (ms). */
const PLAY_ALL_GAP_MS = 1600;
/** Refresco del contador de rendimiento (ms). */
const STATS_EVERY_MS = 500;

export function VfxDebug(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vfxRef = useRef<Vfx>();
  const settings = useSettings();
  const t = makeT(settings.lang);
  const [last, setLast] = useState<string>('');
  const [stats, setStats] = useState({ fps: 0, calls: 0, n: 0 });
  const worldRef = useRef<World>();
  const reduced = settings.reducedMotion;

  useEffect(() => {
    vfxRef.current?.setContext({ reducedMotion: reduced });
    worldRef.current?.setOptions({ reducedMotion: reduced });
  }, [reduced]);

  const fire = (id: SequenceId, event: GameEvent): void => {
    audio.unlock();
    const b = beatFor(event);
    if (b.sfx) audio.play(b.sfx);
    worldRef.current?.react(event);
    vfxRef.current?.play(id, event);
    setLast(id);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World(canvas, { colorBlind: settings.colorBlind });
    world.update(FAKE_VIEW, { you: 'You', r1: 'Rival 1', r2: 'Rival 2' });
    const vfx = new Vfx({
      world,
      colorBlind: settings.colorBlind,
      reducedMotion: settings.reducedMotion,
      youId: 'you',
    });
    vfxRef.current = vfx;
    worldRef.current = world;
    let raf = 0;
    let prev = 0;
    let lastStats = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      vfx.update(prev ? Math.min(100, now - prev) : 16);
      prev = now;
      world.update(FAKE_VIEW, { you: 'You', r1: 'Rival 1', r2: 'Rival 2' });
      world.render(now);
      if (now - lastStats > STATS_EVERY_MS) {
        lastStats = now;
        const w = world.stats;
        setStats({ fps: Math.round(w.fps), calls: w.drawCalls, n: vfx.stats.particles });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      vfx.dispose();
      world.dispose();
    };
    // Deliberado: la escena se monta una sola vez y se actualiza por el bucle.
  }, []);

  return (
    <div className="app vfx-debug">
      <h2>{t('vfxDebug')}</h2>
      <canvas ref={canvasRef} />
      <div className="row">
        {SEQUENCES.map((s) => (
          <button key={s.id} onClick={() => fire(s.id, s.event)}>
            {s.id}
          </button>
        ))}
        <button
          onClick={() =>
            SEQUENCES.forEach((s, i) =>
              globalThis.setTimeout(() => fire(s.id, s.event), i * PLAY_ALL_GAP_MS),
            )
          }
        >
          {t('vfxPlayAll')}
        </button>
        <label className="small">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => settings.set({ reducedMotion: e.target.checked })}
          />
          {t('reducedMotion')}
        </label>
      </div>
      <p className="muted small">
        {last} · {fmt(t('vfxStats'), stats)}
      </p>
    </div>
  );
}
