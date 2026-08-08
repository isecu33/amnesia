import { describe, expect, it } from 'vitest';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';

interface Cap {
  sent: { to: string; type: string; payload: unknown }[];
  broadcast: { type: string; payload: unknown }[];
}

function harness(humans: number, bots: number) {
  const cap: Cap = { sent: [], broadcast: [] };
  const sink: Sink = {
    send: (to, type, payload) => cap.sent.push({ to, type, payload }),
    broadcast: (type, payload) => cap.broadcast.push({ type, payload }),
  };
  const clock = new FakeClock();
  let n = 0;
  const rand = (): number => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
  const session = new GameSession({ code: 'LASTH', clock, sink, seed: 3, rand });
  const tokens: string[] = [];
  for (let i = 0; i < humans; i++) {
    const r = session.addHuman(`H${i}`);
    if ('token' in r) tokens.push(r.token);
  }
  for (let i = 0; i < bots; i++) session.addBot('greedy');
  session.configure({ mode: 'classic', gameEndScore: 200 });
  session.start();
  clock.advance(11_000);
  return { session, clock, cap, tokens };
}

describe('E16 · si solo queda 1 humano se le ofrece salida', () => {
  it('tras la gracia, el humano restante recibe la oferta con el número de bots', () => {
    const { session, clock, cap } = harness(2, 1);
    session.setDisconnected('p2');
    expect(cap.sent.some((m) => m.type === 'lastHuman')).toBe(false); // aún puede volver
    clock.advance(61_000);

    const offer = cap.sent.filter((m) => m.type === 'lastHuman');
    expect(offer).toHaveLength(1);
    expect(offer[0]?.to).toBe('p1');
    expect(offer[0]?.payload).toEqual({ bots: 2 });
    session.dispose();
  });

  it('no se ofrece nada si quedan dos humanos', () => {
    const { session, clock, cap } = harness(3, 0);
    session.setDisconnected('p3');
    clock.advance(61_000);
    expect(cap.sent.some((m) => m.type === 'lastHuman')).toBe(false);
    session.dispose();
  });

  it('elegir «seguir» deja la partida en marcha contra bots', () => {
    const { session, clock } = harness(2, 1);
    session.setDisconnected('p2');
    clock.advance(61_000);
    expect(session.resolveLastHuman('p1', 'continue')).toBeUndefined();
    const orbitBefore = session.gameState?.orbit ?? 0;
    clock.advance(40_000);
    expect(session.finishedByForfeit).toBe(false);
    expect((session.gameState?.orbit ?? 0) >= orbitBefore).toBe(true);
    session.dispose();
  });

  it('elegir «terminar» cierra la partida con victoria y difunde GAME_ENDED', () => {
    const { session, clock, cap } = harness(2, 1);
    session.setDisconnected('p2');
    clock.advance(61_000);
    expect(session.resolveLastHuman('p1', 'win')).toBeUndefined();

    const ended = cap.broadcast
      .filter((m) => m.type === 'ev')
      .map((m) => (m.payload as { e: { e: string; winner?: string } }).e)
      .filter((e) => e.e === 'GAME_ENDED');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.winner).toBe('p1');
    expect(session.finishedByForfeit).toBe(true);

    // Ya no se aceptan acciones ni corren temporizadores.
    const before = JSON.stringify(session.gameState);
    session.handleAction('p1', { t: 'DRAW_DECK' });
    clock.advance(60_000);
    expect(JSON.stringify(session.gameState)).toBe(before);
    session.dispose();
  });

  it('solo el último humano puede resolver', () => {
    const { session, clock } = harness(2, 1);
    expect(session.resolveLastHuman('p1', 'win')).toMatchObject({ error: 'NOT_LAST_HUMAN' });
    session.setDisconnected('p2');
    clock.advance(61_000);
    expect(session.resolveLastHuman('p2', 'win')).toMatchObject({ error: 'NOT_A_PLAYER' });
    expect(session.resolveLastHuman('nadie', 'win')).toMatchObject({ error: 'NOT_A_PLAYER' });
    session.dispose();
  });

  it('tras terminar por abandono se puede pedir revancha', () => {
    const { session, clock } = harness(2, 1);
    session.setDisconnected('p2');
    clock.advance(61_000);
    session.resolveLastHuman('p1', 'win');
    expect(session.rematch()).toBeUndefined();
    expect(session.gameState?.phase).toBe('INITIAL_PEEK');
    expect(session.finishedByForfeit).toBe(false);
    session.dispose();
  });
});
