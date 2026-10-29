/** Test de integración WP-06: 3 clientes reales juegan por la sala Colyseus. */
import { Server } from 'colyseus';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@totem/core';
import { TotemRoom } from './room.js';

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
  joined?: { playerId: string; token: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listen(client: any): Inbox {
  const box: Inbox = { views: [], events: [], errors: [] };
  client.onMessage('view', (m: { v: PlayerView }) => box.views.push(m.v));
  client.onMessage('ev', (m: { e: GameEvent }) => box.events.push(m.e));
  client.onMessage('err', (m: { code: string }) => box.errors.push(m));
  client.onMessage('joined', (m: { playerId: string; token: string }) => (box.joined = m));
  client.onMessage('lobbyState', () => undefined);
  client.onMessage('pong', () => undefined);
  client.onMessage('emote', () => undefined);
  return box;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('sala Colyseus totem_room', () => {
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

  it('el mapa de sala lo fija solo el anfitrión y la sala rechaza mapas inventados (D-044)', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 5 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const b2 = listen(c2);
    await wait(30);
    const session = (room as unknown as TotemRoom).sessionForTests;
    const mapOf = (): unknown =>
      (session as unknown as { roomConfig: { mapId?: string } }).roomConfig.mapId;

    c2.send('configure', { config: { mapId: 'fog-marsh' } });
    await wait(40);
    expect(b2.errors.map((e) => e.code)).toContain('NOT_HOST');
    expect(mapOf()).toBeUndefined();

    c1.send('configure', { config: { mapId: 'castle' } });
    await wait(40);
    expect(b1.errors.map((e) => e.code)).toContain('BAD_PAYLOAD');
    expect(mapOf()).toBeUndefined();

    c1.send('configure', { config: { mapId: 'fog-marsh' } });
    await wait(40);
    expect(mapOf()).toBe('fog-marsh');
    await room.disconnect();
  });

  it('revancha y oferta al último humano llegan a la sala (antes se ignoraban)', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 11 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    await wait(30);
    c1.send('addBot', { kind: 'greedy' });
    await wait(40);

    // Sin partida, el mensaje se responde con un error en vez de perderse.
    c1.send('rematch', {});
    await wait(40);
    expect(b1.errors.some((e) => e.code === 'CANNOT_REMATCH')).toBe(true);

    c1.send('startGame', {});
    await wait(60);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.started).toBe(true);

    // Un único humano frente a un bot: elige terminar con victoria (E16, D-019).
    c1.send('resolveLastHuman', { choice: 'win' });
    await waitFor(() => b1.events.some((e) => e.e === 'GAME_ENDED'), 3000);

    const viewsBefore = b1.views.length;
    c1.send('rematch', {});
    await waitFor(() => b1.views.slice(viewsBefore).some((v) => v.phase === 'INITIAL_PEEK'), 3000);
    expect(b1.errors.map((e) => e.code)).not.toContain('NOT_HOST');
    await room.disconnect();
  }, 20000);
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return;
    await wait(50);
  }
  throw new Error('waitFor: se agotó el tiempo');
}
