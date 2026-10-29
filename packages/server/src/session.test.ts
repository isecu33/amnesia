import { describe, expect, it } from 'vitest';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';
import { CODE_ALPHABET, isValidRoomCode, makeRoomCode } from './codes.js';
import { replay } from './replay.js';
import type { GameEvent, PlayerView } from '@totem/core';

interface Captured {
  sent: { to: string; type: string; payload: unknown }[];
  broadcast: { type: string; payload: unknown }[];
}

function harness(opts: { seed?: number; humans?: number; bots?: number } = {}) {
  const cap: Captured = { sent: [], broadcast: [] };
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
  const session = new GameSession({ code: 'ABCDE', clock, sink, seed: opts.seed ?? 7, rand });
  const tokens: string[] = [];
  for (let i = 0; i < (opts.humans ?? 3); i++) {
    const r = session.addHuman(`H${i}`);
    if ('token' in r) tokens.push(r.token);
  }
  for (let i = 0; i < (opts.bots ?? 0); i++) session.addBot('greedy');
  return { session, clock, cap, tokens };
}

const viewsFor = (cap: Captured, pid: string): PlayerView[] =>
  cap.sent
    .filter((m) => m.to === pid && m.type === 'view')
    .map((m) => (m.payload as { v: PlayerView }).v);
const eventsBroadcast = (cap: Captured): GameEvent[] =>
  cap.broadcast.filter((m) => m.type === 'ev').map((m) => (m.payload as { e: GameEvent }).e);
const privateEventsTo = (cap: Captured, pid: string): GameEvent[] =>
  cap.sent
    .filter((m) => m.to === pid && m.type === 'ev')
    .map((m) => (m.payload as { e: GameEvent }).e);

describe('códigos de sala (docs/02 §4.2)', () => {
  it('son 5 letras sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeRoomCode();
      expect(c).toHaveLength(5);
      expect(isValidRoomCode(c)).toBe(true);
      for (const ch of c) expect('O0I1L').not.toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[O0I1L]/);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('AAAAO')).toBe(false);
  });
});

describe('lobby', () => {
  it('el primero es anfitrión, se puede arrancar con 2 y no con 1', () => {
    const { session } = harness({ humans: 1 });
    expect(session.isHost('p1')).toBe(true);
    expect(session.canStart).toBe(false);
    expect(session.start()).toMatchObject({ error: 'NOT_ENOUGH_PLAYERS' });
    session.addBot('random');
    expect(session.canStart).toBe(true);
    expect(session.start()).toBeUndefined();
    expect(session.started).toBe(true);
    expect(session.start()).toMatchObject({ error: 'GAME_ALREADY_STARTED' });
  });

  it('los bots llevan nombre con ordinal limpio, sin filtrar el id interno', () => {
    const { session } = harness({ humans: 1 });
    session.addBot('greedy');
    session.addBot('random');
    const names = session.seatList.filter((x) => x.controller === 'bot').map((x) => x.name);
    expect(names).toEqual(['Bot listo 1', 'Bot torpe 2']);
    for (const n of names) expect(n).not.toMatch(/^(Zorro|Ratón)/);
  });

  it('rechaza entrar con la sala llena o la partida empezada', () => {
    const { session } = harness({ humans: 6 });
    expect(session.addHuman('extra')).toMatchObject({ error: 'ROOM_FULL' });
    expect(session.addBot()).toMatchObject({ error: 'ROOM_FULL' });
    session.start();
    expect(session.addHuman('tarde')).toMatchObject({ error: 'GAME_ALREADY_STARTED' });
  });

  it('al irse el anfitrión el asiento de anfitrión pasa al siguiente', () => {
    const { session } = harness({ humans: 3 });
    session.removeSeat('p1');
    expect(session.isHost('p2')).toBe(true);
  });

  it('la config de sala escala los temporizadores (accesibilidad ×1,5)', () => {
    const { session } = harness({ humans: 2 });
    session.configure({ timeScale: 1.5, turnSeconds: 20, mode: 'quick' });
    session.start();
    const cfg = session.gameState?.config;
    expect(cfg?.turnSeconds).toBe(30);
    expect(cfg?.initialPeekSeconds).toBe(15);
    expect(cfg?.mode).toBe('quick');
  });

  it('acortar el vislumbre recalcula el autocompletado y la partida arranca', () => {
    const { session } = harness({ humans: 2 });
    session.configure({ initialPeekSeconds: 5, turnSeconds: 15, mode: 'quick' });
    expect(session.start()).toBeUndefined();
    const cfg = session.gameState?.config;
    expect(cfg?.initialPeekSeconds).toBe(5);
    expect(cfg?.autoPeekAtSecond).toBe(2);
  });

  it('una config imposible no rompe la sala', () => {
    const { session } = harness({ humans: 2 });
    session.configure({ turnSeconds: 999 as number });
    expect(session.start()).toMatchObject({ error: expect.stringContaining('Config') });
  });
});

describe('mapa de sala (D-044)', () => {
  const lastLobby = (cap: Captured): { config: { mapId?: string }; map?: string } =>
    cap.broadcast.filter((m) => m.type === 'lobbyState').at(-1)?.payload as never;

  it('por defecto el mapa es el nocturno con velas y no gasta azar', () => {
    const { session, cap } = harness({ humans: 2 });
    session.start();
    expect(lastLobby(cap).map).toBe('candle-night');
  });

  it('la elección del anfitrión se guarda, se difunde y no llega a core', () => {
    const { session, cap } = harness({ humans: 2 });
    session.configure({ mapId: 'frozen-cave' });
    expect(lastLobby(cap).config.mapId).toBe('frozen-cave');
    expect(lastLobby(cap).map).toBeUndefined(); // aún no hay partida
    expect(session.start()).toBeUndefined();
    expect(lastLobby(cap).map).toBe('frozen-cave');
    expect(session.gameState?.config).not.toHaveProperty('mapId');
  });

  it('«random» se resuelve en el servidor con el RNG inyectado: determinista y fijo', () => {
    const run = (): string | undefined => {
      const { session, cap } = harness({ humans: 2 });
      session.configure({ mapId: 'random' });
      session.start();
      return lastLobby(cap).map;
    };
    const a = run();
    expect(a).toMatch(/^(candle-night|frozen-cave|jungle-temple|fog-marsh|totem-canyon)$/);
    expect(run()).toBe(a);
    // Fijo durante la partida: reconfigurar no lo cambia.
    const { session, cap } = harness({ humans: 2 });
    session.configure({ mapId: 'random' });
    session.start();
    const fixed = lastLobby(cap).map;
    session.configure({ mapId: 'totem-canyon' });
    session.pushLobby();
    expect(lastLobby(cap).map).toBe(fixed);
  });

  it('mapId no altera la partida: misma semilla, mismas manos con cualquier mapa', () => {
    const hands = (mapId?: 'fog-marsh'): unknown => {
      const { session } = harness({ humans: 2, seed: 11 });
      if (mapId) session.configure({ mapId });
      session.start();
      return session.gameState?.players.map((p) => p.slots);
    };
    expect(hands('fog-marsh')).toEqual(hands());
  });

  it('en la revancha «random» se vuelve a resolver y la opción se conserva', () => {
    const { session, cap } = harness({ humans: 1, bots: 1 });
    session.configure({ mapId: 'random', mode: 'quick' });
    session.start();
    expect(session.resolveLastHuman('p1', 'win')).toBeUndefined();
    expect(session.rematch()).toBeUndefined();
    expect(lastLobby(cap).config.mapId).toBe('random');
    expect(lastLobby(cap).map).toMatch(/^[a-z-]+$/);
    expect(session.gameState?.config.mode).toBe('quick');
  });
});

describe('WP-06 · bucle autoritativo acción → apply → difusión', () => {
  it('los eventos privados llegan SOLO a su destinatario', () => {
    const { session, cap, clock } = harness({ humans: 3 });
    session.start();
    clock.advance(11000); // termina el vislumbre inicial
    const active = session.viewOf('p1').activePlayer;
    session.handleAction(active, { t: 'DRAW_DECK' });

    const priv = privateEventsTo(cap, active).filter((e) => e.e === 'DREW_VALUE');
    expect(priv.length).toBeGreaterThan(0);
    for (const pid of ['p1', 'p2', 'p3']) {
      if (pid === active) continue;
      expect(privateEventsTo(cap, pid).some((e) => e.e === 'DREW_VALUE')).toBe(false);
    }
    // Y el evento público no lleva valor.
    const drew = eventsBroadcast(cap).find((e) => e.e === 'DREW');
    expect(drew).toBeDefined();
    expect(JSON.stringify(drew)).not.toContain('value');
  });

  it('el servidor inyecta p y tick: no se confía en el cliente', () => {
    const { session, clock } = harness({ humans: 2 });
    session.start();
    clock.advance(11000);
    const active = session.viewOf('p1').activePlayer;
    const other = active === 'p1' ? 'p2' : 'p1';
    // El "otro" manda una acción: el servidor la firma con SU id, así que se rechaza.
    session.handleAction(other, { t: 'DRAW_DECK' });
    expect(session.gameState?.phase).toBe('TURN_DRAW');
    session.handleAction(active, { t: 'DRAW_DECK' });
    expect(session.gameState?.phase).toBe('TURN_RESOLVE');
    expect(session.gameState?.tick).toBe(clock.now());
  });

  it('una acción ilegal devuelve err solo al emisor', () => {
    const { session, cap, clock } = harness({ humans: 2 });
    session.start();
    clock.advance(11000);
    const active = session.viewOf('p1').activePlayer;
    session.handleAction(active, { t: 'DISCARD_DRAWN' });
    const errs = cap.sent.filter((m) => m.type === 'err');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.to).toBe(active);
    expect(cap.broadcast.some((m) => m.type === 'err')).toBe(false);
  });

  it('las vistas que reciben los clientes coinciden con viewFor', () => {
    const { session, cap, clock } = harness({ humans: 3 });
    session.start();
    clock.advance(11000);
    for (const pid of ['p1', 'p2', 'p3']) {
      const last = viewsFor(cap, pid).at(-1);
      expect(last).toEqual(session.viewOf(pid));
    }
  });

  it('actuar antes de empezar devuelve error', () => {
    const { session, cap } = harness({ humans: 2 });
    session.handleAction('p1', { t: 'DRAW_DECK' });
    expect(cap.sent.some((m) => m.type === 'err')).toBe(true);
  });
});

describe('WP-06 · temporizadores centralizados', () => {
  it('el reloj de turno dispara solo y pasa el turno (E15)', () => {
    const { session, clock } = harness({ humans: 2 });
    session.configure({ mode: 'quick' });
    session.start();
    clock.advance(11000);
    const first = session.viewOf('p1').activePlayer;
    clock.advance(31000);
    expect(session.viewOf('p1').activePlayer).not.toBe(first);
  });

  it('el vislumbre inicial se autocompleta y arranca el turno sin intervención', () => {
    const { session, clock } = harness({ humans: 3 });
    session.start();
    expect(session.gameState?.phase).toBe('INITIAL_PEEK');
    clock.advance(7100);
    expect(session.gameState?.peekAutoCompleted).toBe(true);
    clock.advance(3100);
    expect(session.gameState?.phase).toBe('TURN_DRAW');
  });
});

describe('WP-07 · arbitraje de Descarte Rápido con dos intentos encolados (E5)', () => {
  it('el primero se procesa y el segundo se cancela sin castigo', () => {
    const { session, cap, clock } = harness({ humans: 3 });
    session.configure({ mode: 'quick' });
    session.start();
    clock.advance(11000);

    // Montaje: dos jugadores con el mismo valor que la superior del descarte.
    const s = session.gameState;
    if (!s) throw new Error('sin estado');
    const top = s.discard[s.discard.length - 1];
    if (!top) throw new Error('sin descarte');
    const b = s.players.find((p) => p.id === 'p2');
    const c = s.players.find((p) => p.id === 'p3');
    if (!b || !c) throw new Error('sin jugadores');
    const oldB = b.slots[0];
    const oldC = c.slots[0];
    b.slots[0] = { id: 'x1', value: top.value };
    c.slots[0] = { id: 'x2', value: top.value };
    if (oldB) s.deck.push(oldB);
    if (oldC) s.deck.push(oldC);

    const cCards = c.slots.filter((x) => x !== null).length;
    session.handleAction('p2', { t: 'MATCH_ATTEMPT', slot: 0 });
    clock.advance(100); // dentro de la ventana de 300 ms
    session.handleAction('p3', { t: 'MATCH_ATTEMPT', slot: 0 });

    const evs = eventsBroadcast(cap);
    expect(evs.some((e) => e.e === 'MATCH_OK' && e.player === 'p2')).toBe(true);
    const rejected = evs.find((e) => e.e === 'MATCH_REJECTED');
    expect(rejected).toMatchObject({ player: 'p3', reason: 'tooLate' });
    expect(
      session.gameState?.players.find((p) => p.id === 'p3')?.slots.filter((x) => x).length,
    ).toBe(cCards);
  });
});

describe('WP-07 · reconexión (E9, E16, E18)', () => {
  it('tras la gracia un bot toma el asiento; al volver, el humano recupera su vista', () => {
    const { session, cap, clock, tokens } = harness({ humans: 3 });
    session.configure({ mode: 'quick' });
    session.start();
    clock.advance(11000);

    session.setDisconnected('p2');
    expect(session.gameState?.players.find((p) => p.id === 'p2')?.controller).toBe('human');
    clock.advance(61000); // reconnectGraceSeconds = 60 s
    expect(session.gameState?.players.find((p) => p.id === 'p2')?.controller).toBe('bot');
    expect(eventsBroadcast(cap).some((e) => e.e === 'PLAYER_SEAT' && e.player === 'p2')).toBe(true);

    const before = cap.sent.filter((m) => m.to === 'p2' && m.type === 'view').length;
    const r = session.reconnect(tokens[1] as string);
    expect(r).toMatchObject({ playerId: 'p2' });
    expect(session.gameState?.players.find((p) => p.id === 'p2')?.controller).toBe('human');
    const after = cap.sent.filter((m) => m.to === 'p2' && m.type === 'view');
    expect(after.length).toBeGreaterThan(before);
    // E18: el snapshot no reenvía nada oculto.
    const v = (after.at(-1)?.payload as { v: PlayerView }).v;
    expect(v.you.slots.every((x) => x === 'hidden' || x === 'empty')).toBe(true);
  });

  it('un bot juega el turno del desconectado mientras no vuelve', () => {
    const { session, clock } = harness({ humans: 2 });
    session.configure({ mode: 'quick' });
    session.start();
    clock.advance(11000);
    session.setDisconnected('p2');
    clock.advance(61000);
    const orbitBefore = session.gameState?.orbit ?? 0;
    clock.advance(20000);
    expect((session.gameState?.orbit ?? 0) >= orbitBefore).toBe(true);
    expect(session.gameState?.phase).not.toBe('INITIAL_PEEK');
  });

  it('un token inválido no da asiento', () => {
    const { session } = harness({ humans: 2 });
    expect(session.reconnect('no-existe')).toMatchObject({ error: 'BAD_TOKEN' });
  });

  it('desconectarse en el lobby libera el asiento', () => {
    const { session } = harness({ humans: 3 });
    session.setDisconnected('p3');
    expect(session.seatList.map((s) => s.playerId)).toEqual(['p1', 'p2']);
  });
});

describe('WP-07 · bots y replays', () => {
  it('100 partidas bot contra bot terminan limpias por el servidor real', () => {
    let finished = 0;
    for (let i = 0; i < 100; i++) {
      const { session, clock } = harness({ humans: 0, bots: 0, seed: 1000 + i });
      session.addBot(i % 2 === 0 ? 'greedy' : 'random');
      session.addBot('greedy');
      session.addBot('random');
      session.configure({ mode: 'quick' });
      expect(session.start()).toBeUndefined();
      for (let step = 0; step < 400 && session.gameState?.phase !== 'GAME_END'; step++) {
        clock.advance(1000);
      }
      expect(session.gameState?.phase, `partida ${i}`).toBe('GAME_END');
      // I1 por el camino: 52 cartas al final.
      const s = session.gameState;
      const inSlots = s ? s.players.reduce((n, p) => n + p.slots.filter((x) => x).length, 0) : 0;
      expect((s?.deck.length ?? 0) + (s?.discard.length ?? 0) + inSlots).toBe(52);
      finished++;
      session.dispose();
    }
    expect(finished).toBe(100);
  });

  it('el replay de una partida reproduce el estado final', () => {
    const { session, clock } = harness({ humans: 0, seed: 4242 });
    session.addBot('greedy');
    session.addBot('greedy');
    session.addBot('random');
    session.configure({ mode: 'quick' });
    session.start();
    for (let step = 0; step < 400 && session.gameState?.phase !== 'GAME_END'; step++) {
      clock.advance(1000);
    }
    expect(session.gameState?.phase).toBe('GAME_END');

    const file = session.toReplay();
    expect(file.actions.length).toBeGreaterThan(10);
    const r = replay(file);
    expect(r.mismatch).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.finalPhase).toBe('GAME_END');
    expect(r.totals).toEqual(file.finalTotals);
  });

  it('el replay detecta un log manipulado', () => {
    const { session, clock } = harness({ humans: 0, seed: 99 });
    session.addBot('greedy');
    session.addBot('random');
    session.configure({ mode: 'quick' });
    session.start();
    for (let step = 0; step < 400 && session.gameState?.phase !== 'GAME_END'; step++) {
      clock.advance(1000);
    }
    const file = session.toReplay();
    const tampered = { ...file, finalTotals: { ...file.finalTotals, p1: 12345 } };
    expect(replay(tampered).ok).toBe(false);
  });

  it('el modo clásico a 100 también llega al final con bots', () => {
    const { session, clock } = harness({ humans: 0, seed: 8 });
    session.addBot('greedy');
    session.addBot('greedy');
    session.configure({ mode: 'classic', gameEndScore: 50 });
    session.start();
    for (let step = 0; step < 4000 && session.gameState?.phase !== 'GAME_END'; step++) {
      clock.advance(1000);
    }
    expect(session.gameState?.phase).toBe('GAME_END');
    expect(session.gameState?.round).toBeGreaterThan(1);
  });

  it('emote se difunde a la sala', () => {
    const { session, cap } = harness({ humans: 2 });
    session.emote('p1', 3);
    expect(cap.broadcast.some((m) => m.type === 'emote')).toBe(true);
  });
});
