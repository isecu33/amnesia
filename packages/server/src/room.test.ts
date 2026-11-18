/** Test de integración WP-06: 3 clientes reales juegan por la sala Colyseus. */
import { Server } from 'colyseus';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@totem/core';
import { TotemRoom } from './room.js';
import { PROTOCOL_VERSION } from '@totem/protocol';
import { FakeClock } from './clock.js';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  const gameServer = new Server();
  gameServer.define('totem_room', TotemRoom);
  colyseus = await boot(gameServer, 2999);
});
afterAll(async () => {
  await colyseus.shutdown();
});

interface Inbox {
  views: PlayerView[];
  events: GameEvent[];
  errors: { code: string }[];
  lobbies: { started: boolean; seats: { avatar: number }[] }[];
  lastHuman: { bots: number }[];
  joined?: { playerId: string; token: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listen(client: any): Inbox {
  const box: Inbox = { views: [], events: [], errors: [], lobbies: [], lastHuman: [] };
  client.onMessage('view', (m: { v: PlayerView }) => box.views.push(m.v));
  client.onMessage('ev', (m: { e: GameEvent }) => box.events.push(m.e));
  client.onMessage('err', (m: { code: string }) => box.errors.push(m));
  client.onMessage('joined', (m: { playerId: string; token: string }) => (box.joined = m));
  client.onMessage('lobbyState', (m: { started: boolean; seats: { avatar: number }[] }) =>
    box.lobbies.push(m),
  );
  client.onMessage('lastHuman', (m: { bots: number }) => box.lastHuman.push(m));
  client.onMessage('pong', () => undefined);
  client.onMessage('emote', () => undefined);
  return box;
}

const lastSeats = (b: Inbox): { avatar: number }[] => b.lobbies[b.lobbies.length - 1]?.seats ?? [];
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('sala Colyseus totem_room', () => {
  it('hello con protocolVersion incorrecto → PROTOCOL_MISMATCH', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 1 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const b2 = listen(c2);
    c1.send('hello', { name: 'Ana', protocolVersion: PROTOCOL_VERSION });
    c2.send('hello', { name: 'Bea', protocolVersion: PROTOCOL_VERSION + 1 });
    await waitFor(() => b2.errors.some((e) => e.code === 'PROTOCOL_MISMATCH'), 5000);
    await waitFor(() => lastSeats(b1).length === 1 && b1.joined !== undefined, 5000);
    expect(b2.errors.some((e) => e.code === 'PROTOCOL_MISMATCH')).toBe(true);
    expect(b1.joined?.playerId).toBe('p1');
    expect(lastSeats(b1)).toHaveLength(1);
    expect((room as unknown as TotemRoom).sessionForTests.seatList).toHaveLength(1);
  });

  it('onJoin con protocolVersion incorrecto en opciones', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 1 });
    // El rechazo cierra la conexión durante el join: connectTo rechaza sin haber recibido `joined`.
    await expect(
      colyseus.connectTo(room, { name: 'Ana', protocolVersion: PROTOCOL_VERSION + 1 }),
    ).rejects.toMatchObject({ message: 'PROTOCOL_MISMATCH' });
    await wait(100);
    expect((room as unknown as TotemRoom).sessionForTests.seatList.length).toBe(0);
  });

  it('avatar del hello aparece en lobbyState.seats', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 1 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const b2 = listen(c2);
    c1.send('hello', { name: 'Ana', avatar: 5, protocolVersion: PROTOCOL_VERSION });
    c2.send('hello', { name: 'Bea', protocolVersion: PROTOCOL_VERSION });
    await waitFor(
      () =>
        lastSeats(b1).length === 2 && lastSeats(b2).length === 2 && lastSeats(b1)[0]?.avatar === 5,
      5000,
    );
    expect(lastSeats(b1).map((s) => s.avatar)).toEqual([5, 0]);
    expect(lastSeats(b2).map((s) => s.avatar)).toEqual([5, 0]);
  });

  it('hello con avatar fuera de rango (12) → BAD_PAYLOAD sin cambiar el asiento', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 1 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    c1.send('hello', { name: 'Ana', avatar: 12, protocolVersion: PROTOCOL_VERSION });
    await wait(100);
    expect(b1.errors.some((e) => e.code === 'BAD_PAYLOAD')).toBe(true);
    expect((room as unknown as TotemRoom).sessionForTests.seatList[0]?.avatar).toBe(0);
  });

  it('3 clientes entran, juegan una ronda y sus vistas coinciden con viewFor', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 4242 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const b2 = listen(c2);
    const c3 = await colyseus.connectTo(room, { name: 'Caro' });
    const b3 = listen(c3);
    for (const c of [c1, c2, c3]) c.send('hello', { name: 'x', protocolVersion: 1 });
    await wait(80);

    expect(b1.joined?.playerId).toBe('p1');
    expect(b3.joined?.playerId).toBe('p3');

    c1.send('configure', { config: { initialPeekSeconds: 5, turnSeconds: 15, mode: 'quick' } });
    await wait(40);

    // Solo el anfitrión arranca.
    c2.send('startGame', {});
    await wait(50);
    expect(b2.errors.some((e) => e.code === 'NOT_HOST')).toBe(true);

    c1.send('startGame', {});
    await wait(50);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.started).toBe(true);

    // Vislumbre inicial: cada uno elige 2 tótems.
    for (const c of [c1, c2, c3]) c.send('action', { a: { t: 'PEEK_INITIAL', slots: [0, 1] } });
    await wait(50);
    for (const box of [b1, b2, b3]) {
      const mine = box.events.filter((e) => e.e === 'INITIAL_PEEK_RESULT');
      expect(mine).toHaveLength(1); // solo el suyo
    }

    // Esperamos a que caduque el vislumbre (10 s) usando el reloj real acelerado
    // por el propio servidor: forzamos el fin disparando los timers de la sesión.
    await waitFor(() => session.gameState?.phase === 'TURN_DRAW', 9000);

    // Turnos scriptados: el activo roba y descarta hasta cerrar una órbita.
    for (let i = 0; i < 3; i++) {
      const active = session.viewOf('p1').activePlayer;
      const client = { p1: c1, p2: c2, p3: c3 }[active as 'p1' | 'p2' | 'p3'];
      client?.send('action', { a: { t: 'DRAW_DECK' } });
      await waitFor(() => session.gameState?.phase !== 'TURN_DRAW', 2000);
      if (session.gameState?.phase === 'TURN_RESOLVE') {
        client?.send('action', { a: { t: 'SWAP_DRAWN', slot: 0 } });
      } else if (session.gameState?.phase === 'EFFECT_TARGETING') {
        client?.send('action', { a: { t: 'EFFECT_SKIP' } });
      }
      await wait(80);
    }

    // Las vistas que tienen los clientes son exactamente las de viewFor.
    for (const [pid, box] of [
      ['p1', b1],
      ['p2', b2],
      ['p3', b3],
    ] as const) {
      const last = box.views.at(-1);
      expect(last, `sin vista para ${pid}`).toBeDefined();
      expect(last).toEqual(session.viewOf(pid));
    }

    // Los eventos privados NUNCA llegan a quien no toca (aserción explícita).
    for (const [pid, box] of [
      ['p1', b1],
      ['p2', b2],
      ['p3', b3],
    ] as const) {
      for (const e of box.events) {
        if ('to' in e) expect(e.to, `evento privado filtrado a ${pid}`).toBe(pid);
      }
    }
    await room.disconnect();
  }, 30000);

  it('valida con zod y limita la tasa de mensajes', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 1 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const box = listen(c1);
    await wait(30);

    c1.send('action', { a: { t: 'START_ROUND' } }); // acción de servidor
    c1.send('action', { a: { t: 'SWAP_DRAWN', slot: 99 } }); // fuera de rango
    c1.send('emote', { id: 99 }); // fuera de rango
    await wait(80);
    expect(box.errors.filter((e) => e.code === 'BAD_PAYLOAD').length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < 15; i++) c1.send('ping', {});
    await wait(120);
    expect(box.errors.some((e) => e.code === 'RATE_LIMITED')).toBe(true);
    await room.disconnect();
  }, 20000);

  it('un cliente que se cae vuelve con su token al mismo asiento (E18)', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 11 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const b2 = listen(c2);
    for (const c of [c1, c2]) c.send('hello', { name: 'x', protocolVersion: 1 });
    await wait(80);

    const token = b2.joined?.token;
    const playerId = b2.joined?.playerId;
    expect(token).toBeTruthy();
    expect(playerId).toBe('p2');

    c1.send('configure', { config: { initialPeekSeconds: 5, turnSeconds: 15, mode: 'quick' } });
    await wait(40);
    c1.send('startGame', {});
    await wait(80);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.started).toBe(true);

    // Se cae y vuelve con el token: mismo asiento y snapshot fresco.
    await c2.leave();
    await wait(120);
    const back = await colyseus.connectTo(room, { name: 'Bea', token });
    const b3 = listen(back);
    back.send('hello', { name: 'Bea', protocolVersion: 1 });
    await waitFor(() => b3.views.length > 0, 5000);

    expect(b3.joined?.playerId).toBe('p2');
    expect(session.seatList.find((s) => s.playerId === 'p2')?.controller).toBe('human');
    // E18: el snapshot no re-muestra nada oculto.
    const v = b3.views.at(-1);
    expect(v?.you.slots.every((x) => x === 'hidden' || x === 'empty')).toBe(true);
    expect(v).toEqual(session.viewOf('p2'));
    expect(b1.errors).toEqual([]);
    await room.disconnect();
  }, 40000);

  it('los bots rellenan la sala y la partida avanza sola', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 3 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    listen(c1);
    await wait(30);
    c1.send('configure', { config: { initialPeekSeconds: 5, turnSeconds: 15, mode: 'quick' } });
    c1.send('addBot', { kind: 'greedy' });
    c1.send('addBot', { kind: 'random' });
    await wait(60);
    c1.send('startGame', {});
    await wait(60);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.started).toBe(true);
    expect(session.seatList.filter((s) => s.controller === 'bot')).toHaveLength(2);
    await waitFor(() => session.gameState?.phase === 'TURN_DRAW', 9000);
    const orbitBefore = session.gameState?.orbit ?? 0;
    await waitFor(() => (session.gameState?.orbit ?? 0) > orbitBefore, 25000);
    expect(session.gameState?.orbit).toBeGreaterThan(orbitBefore);
    await room.disconnect();
  }, 45000);

  describe('rematch y resolveLastHuman (E16)', () => {
    async function setup(seed: number) {
      const clock = new FakeClock();
      const room = await colyseus.createRoom('totem_room', { seed, clock });
      const c1 = await colyseus.connectTo(room, { name: 'Ana' });
      const b1 = listen(c1);
      const c2 = await colyseus.connectTo(room, { name: 'Bea' });
      const b2 = listen(c2);
      for (const c of [c1, c2]) c.send('hello', { name: 'x', protocolVersion: 1 });
      await wait(60);
      c1.send('addBot', { kind: 'greedy' });
      c1.send('configure', { config: { mode: 'classic', gameEndScore: 200 } });
      await wait(40);
      c1.send('startGame', {});
      await wait(60);
      clock.advance(11_000);
      const session = (room as unknown as TotemRoom).sessionForTests;
      expect(session.started).toBe(true);
      return { room, clock, c1, c2, b1, b2, session };
    }

    it('rematch · el anfitrión reinicia con semilla nueva desde el fin forzado E16', async () => {
      const { room, clock, c1, c2, b1, b2, session } = await setup(21);
      await c2.leave();
      await wait(80);
      clock.advance(61_000);
      await waitFor(() => b1.lastHuman.length > 0, 2000);
      c1.send('resolveLastHuman', { choice: 'win' });
      await waitFor(() => session.finishedByForfeit, 2000);

      const seed0 = session.toReplay().seed;
      const lobbiesBefore = b1.lobbies.length;
      c1.send('rematch', {});
      await waitFor(() => b1.lobbies.length > lobbiesBefore, 2000);
      expect(b1.lobbies.at(-1)?.started).toBe(true);
      expect(session.toReplay().seed).not.toBe(seed0);
      expect(session.gameState?.phase).toBe('INITIAL_PEEK');
      expect(b1.errors).toEqual([]);
      expect(b2.errors).toEqual([]);
      await room.disconnect();
    });

    it('rematch · un no anfitrión recibe NOT_HOST y la sesión no cambia', async () => {
      const { room, c2, b2, session } = await setup(22);
      const seed0 = session.toReplay().seed;
      c2.send('rematch', {});
      await waitFor(() => b2.errors.some((e) => e.code === 'NOT_HOST'), 2000);
      expect(session.toReplay().seed).toBe(seed0);
      await room.disconnect();
    });

    it('rematch · sin partida terminada devuelve GAME_NOT_FINISHED', async () => {
      const { room, c1, b1 } = await setup(23);
      c1.send('rematch', {});
      await waitFor(() => b1.errors.length > 0, 2000);
      expect(b1.errors.map((e) => e.code)).toEqual(['GAME_NOT_FINISHED']);
      await room.disconnect();
    });

    it('resolveLastHuman win (E16) · todos los conectados reciben GAME_ENDED', async () => {
      const { room, clock, c1, c2, b1, session } = await setup(24);
      await c2.leave();
      await wait(80);
      clock.advance(61_000);
      await waitFor(() => b1.lastHuman.length > 0, 2000);
      expect(b1.lastHuman[0]?.bots).toBe(2);
      c1.send('resolveLastHuman', { choice: 'win' });
      await waitFor(() => b1.events.some((e) => e.e === 'GAME_ENDED'), 2000);
      const ended = b1.events.find((e) => e.e === 'GAME_ENDED');
      expect(ended).toMatchObject({ winner: 'p1' });
      expect(session.finishedByForfeit).toBe(true);
      await room.disconnect();
    });

    it('resolveLastHuman · con dos humanos NOT_LAST_HUMAN y payload inválido BAD_PAYLOAD', async () => {
      const { room, c1, b1, session } = await setup(25);
      c1.send('resolveLastHuman', { choice: 'win' });
      c1.send('resolveLastHuman', { choice: 'x' });
      await waitFor(() => b1.errors.length >= 2, 2000);
      expect(b1.errors.map((e) => e.code)).toEqual(['NOT_LAST_HUMAN', 'BAD_PAYLOAD']);
      expect(session.finishedByForfeit).toBe(false);
      await room.disconnect();
    });

    it('resolveLastHuman continue (E16) · sin error ni cambios', async () => {
      const { room, clock, c1, c2, b1, session } = await setup(26);
      await c2.leave();
      await wait(80);
      clock.advance(61_000);
      await waitFor(() => b1.lastHuman.length > 0, 2000);
      c1.send('resolveLastHuman', { choice: 'continue' });
      await wait(100);
      expect(b1.errors).toEqual([]);
      expect(session.finishedByForfeit).toBe(false);
      await room.disconnect();
    });
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return;
    await wait(50);
  }
  throw new Error('waitFor: se agotó el tiempo');
}
