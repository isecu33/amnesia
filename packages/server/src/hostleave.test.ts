import { describe, expect, it } from 'vitest';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';

function setup(humans: number) {
  const sink: Sink = { send: () => undefined, broadcast: () => undefined };
  const clock = new FakeClock();
  let n = 0;
  const rand = (): number => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
  const session = new GameSession({ code: 'HOSTL', clock, sink, seed: 5, rand });
  for (let i = 0; i < humans; i++) session.addHuman(`H${i}`);
  session.configure({ mode: 'quick' });
  session.start();
  return { session, clock };
}

describe('el anfitrión se va en mitad de la partida', () => {
  it('al convertirse en bot, la anfitriona pasa a otro humano conectado (para poder pedir revancha)', () => {
    const { session, clock } = setup(3);
    expect(session.isHost('p1')).toBe(true);
    session.setDisconnected('p1');
    clock.advance(61_000);
    expect(session.isHost('p1')).toBe(false);
    expect(session.isHost('p2')).toBe(true);
    expect(session.seatList.filter((s) => s.host)).toHaveLength(1);
    session.dispose();
  });

  it('si vuelve dentro de la gracia conserva el anfitrión', () => {
    const { session, clock } = setup(2);
    session.setDisconnected('p1');
    clock.advance(10_000);
    const tok = (session as unknown as { seats: { token: string }[] }).seats[0]?.token ?? '';
    session.reconnect(tok);
    clock.advance(61_000);
    expect(session.isHost('p1')).toBe(true);
    session.dispose();
  });
});
