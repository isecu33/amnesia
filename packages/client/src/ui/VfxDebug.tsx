import { useEffect, useRef, useState } from 'react';
import type { GameEvent, PlayerView } from '@totem/core';
import { World } from '../scene/world.js';
import { Vfx, type SequenceId } from '../vfx/sequences.js';
import { audio } from '../audio/audio.js';
import { beatFor } from '../presenter/timelines.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

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
];

export function VfxDebug(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vfxRef = useRef<Vfx>();
  const settings = useSettings();
  const t = makeT(settings.lang);
  const [last, setLast] = useState<string>('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World(canvas, { colorBlind: settings.colorBlind });
    world.update(FAKE_VIEW, { you: 'You', r1: 'Rival 1', r2: 'Rival 2' });
    const vfx = new Vfx({
      world,
      colorBlind: settings.colorBlind,
      reducedMotion: false,
      youId: 'you',
    });
    vfxRef.current = vfx;
    let raf = 0;
    let prev = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      vfx.update(prev ? now - prev : 16);
      prev = now;
      world.update(FAKE_VIEW, { you: 'You', r1: 'Rival 1', r2: 'Rival 2' });
      world.render(now);
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
          <button
            key={s.id}
            onClick={() => {
              audio.unlock();
              const b = beatFor(s.event);
              if (b.sfx) audio.play(b.sfx);
              vfxRef.current?.play(s.id, s.event);
              setLast(s.id);
            }}
          >
            {s.id}
          </button>
        ))}
      </div>
      <p className="muted small">{last}</p>
    </div>
  );
}
