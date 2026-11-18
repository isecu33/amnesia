import { describe, expect, it } from 'vitest';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';
import { replay } from './replay.js';

function make(humans: number, bots: number, onGameEnd?: () => void) {
  const sink: Sink = { send: () => undefined, broadcast: () => undefined };
  const clock = new FakeClock();
  let n = 0;
  const rand = (): number => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
  const session = new GameSession({
    code: 'REPLY',
    clock,
    sink,
    seed: 5,
    rand,
    ...(onGameEnd ? { onGameEnd } : {}),
  });
  for (let i = 0; i < humans; i++) session.addHuman(`H${i}`);
  for (let i = 0; i < bots; i++) session.addBot('greedy');
  return { session, clock };
}

describe('takeReplay · un replay por partida (#28)', () => {
  it('undefined sin partida; una sola vez por partida; tras rematch gameNo 2', () => {
    const { session } = make(1, 1);
    expect(session.takeReplay()).toBeUndefined();
    session.start();
    const first = session.takeReplay();
    expect(first?.gameNo).toBe(1);
    expect(session.takeReplay()).toBeUndefined();
    const snapshot = JSON.stringify(first?.replay);

    session.resolveLastHuman('p1', 'win');
    expect(session.rematch()).toBeUndefined();
    const second = session.takeReplay();
    expect(second?.gameNo).toBe(2);
    expect(second?.replay.seed).not.toBe(first?.replay.seed);
    expect(JSON.stringify(first?.replay)).toBe(snapshot);
    session.dispose();
  });

  it('GAME_END natural: onGameEnd salta y takeReplay da la partida 1 reproducible', () => {
    let calls = 0;
    const { session, clock } = make(0, 3, () => calls++);
    session.configure({ mode: 'quick' });
    session.start();
    expect(calls).toBe(0);
    for (let step = 0; step < 400 && session.gameState?.phase !== 'GAME_END'; step++) {
      clock.advance(1000);
    }
    expect(session.gameState?.phase).toBe('GAME_END');
    expect(calls).toBeGreaterThanOrEqual(1);
    const taken = session.takeReplay();
    expect(taken?.gameNo).toBe(1);
    expect(replay(taken!.replay).ok).toBe(true);
    expect(session.takeReplay()).toBeUndefined();
    session.dispose();
  });

  it('onGameEnd salta en resolveLastHuman win (E16)', () => {
    let calls = 0;
    const { session } = make(1, 1, () => calls++);
    session.start();
    expect(calls).toBe(0);
    session.resolveLastHuman('p1', 'win');
    expect(calls).toBe(1);
    session.dispose();
  });

  it('con bots el log empieza por su FORFEIT y el replay es reproducible', () => {
    const { session } = make(1, 1);
    session.start();
    const r = session.toReplay();
    expect(r.actions[0]).toMatchObject({ t: 'FORFEIT', p: 'p2' });
    expect(replay(r).ok).toBe(true);
    session.dispose();
  });
});
