import { describe, expect, it } from 'vitest';
import { EMOTE_COOLDOWN_MS } from '@totem/protocol';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';

function setup() {
  const emotes: { player: string; id: number }[] = [];
  const sink: Sink = {
    send: () => undefined,
    broadcast: (type, payload) => {
      if (type === 'emote') emotes.push(payload as { player: string; id: number });
    },
  };
  const clock = new FakeClock();
  const session = new GameSession({ code: 'ABCDE', clock, sink, seed: 1 });
  return { session, clock, emotes };
}

describe('emotes: enfriamiento de 2 s por jugador (D-045)', () => {
  it('descarta el segundo emote del mismo jugador dentro del enfriamiento', () => {
    const { session, clock, emotes } = setup();
    session.emote('p1', 0);
    clock.advance(EMOTE_COOLDOWN_MS - 1);
    session.emote('p1', 1);
    expect(emotes).toEqual([{ player: 'p1', id: 0 }]);
    clock.advance(1);
    session.emote('p1', 2);
    expect(emotes.map((e) => e.id)).toEqual([0, 2]);
  });

  it('el enfriamiento es por jugador: otro jugador no queda bloqueado', () => {
    const { session, emotes } = setup();
    session.emote('p1', 0);
    session.emote('p2', 3);
    expect(emotes.map((e) => e.player)).toEqual(['p1', 'p2']);
  });
});
