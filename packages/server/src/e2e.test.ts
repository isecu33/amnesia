/** WP-08 (gate F3): 2 clientes reales + 2 bots completan una partida entera. */
import { Server } from 'colyseus';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@totem/core';
import { TotemRoom } from './room.js';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  const gameServer = new Server();
  gameServer.define('totem_room', TotemRoom);
  colyseus = await boot(gameServer, 3001);
});
afterAll(async () => {
  await colyseus.shutdown();
});

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Cliente scriptado: reacciona a cada snapshot usando SOLO view.legal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scriptedClient(client: any): {
  events: GameEvent[];
  errors: { code: string; msg: string }[];
  view: () => PlayerView | undefined;
} {
  const events: GameEvent[] = [];
  const errors: { code: string; msg: string }[] = [];
  let view: PlayerView | undefined;
  client.onMessage('ev', (m: { e: GameEvent }) => events.push(m.e));
  client.onMessage('err', (m: { code: string; msg: string }) => errors.push(m));
  client.onMessage('joined', () => undefined);
  client.onMessage('lobbyState', () => undefined);
  client.onMessage('emote', () => undefined);
  client.onMessage('pong', () => undefined);
  client.onMessage('view', (m: { v: PlayerView }) => {
    view = m.v;
    const legal = new Set(m.v.legal);
    // La UI (y este script) solo puede hacer lo que dice `legal`.
    if (legal.has('PEEK_INITIAL')) {
      client.send('action', { a: { t: 'PEEK_INITIAL', slots: [0, 1] } });
      return;
    }
    if (m.v.activePlayer !== m.v.you.id) return;
    // Cantar ÚLTIMA en cuanto sea legal cierra la ronda pronto (y la ejerce de punta a punta).
    if (legal.has('CALL_ULTIMA')) {
      client.send('action', { a: { t: 'CALL_ULTIMA' } });
      return;
    }
    if (legal.has('EFFECT_SKIP')) {
      client.send('action', { a: { t: 'EFFECT_SKIP' } });
      return;
    }
    if (legal.has('DRAW_DECK')) {
      client.send('action', { a: { t: 'DRAW_DECK' } });
      return;
    }
    if (legal.has('DISCARD_DRAWN')) {
      client.send('action', { a: { t: 'DISCARD_DRAWN' } });
      return;
    }
    if (legal.has('SWAP_DRAWN')) {
      const slot = m.v.you.slots.findIndex((s) => s === 'hidden');
      if (slot >= 0) client.send('action', { a: { t: 'SWAP_DRAWN', slot } });
    }
  });
  return { events, errors, view: () => view };
}

describe('WP-08 · partida completa por el servidor real', () => {
  it('2 humanos + 1 bot terminan una partida sin desincronización', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 20260803 });
    const session = (room as unknown as TotemRoom).sessionForTests;

    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const s1 = scriptedClient(c1);
    const c2 = await colyseus.connectTo(room, { name: 'Bea' });
    const s2 = scriptedClient(c2);
    c1.send('hello', { name: 'Ana', protocolVersion: 1 });
    c2.send('hello', { name: 'Bea', protocolVersion: 1 });
    await wait(60);

    // Timers al mínimo legal para que el gate quepa en un test.
    c1.send('configure', {
      config: { mode: 'quick', initialPeekSeconds: 5, turnSeconds: 15, effectTargetSeconds: 5 },
    });
    c1.send('addBot', { kind: 'greedy' });
    await wait(80);
    c1.send('startGame', {});

    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && session.gameState?.phase !== 'GAME_END') await wait(50);

    expect(s1.errors.filter((e) => e.code === 'CANNOT_START')).toEqual([]);
    expect(session.gameState?.phase).toBe('GAME_END');
    expect(session.gameState?.winner).toBeTruthy();

    // Sin desincronización: la última vista de cada cliente es la del servidor.
    expect(s1.view()).toEqual(session.viewOf('p1'));
    expect(s2.view()).toEqual(session.viewOf('p2'));

    // Ningún evento privado se ha filtrado.
    for (const [pid, box] of [
      ['p1', s1],
      ['p2', s2],
    ] as const) {
      for (const e of box.events) if ('to' in e) expect(e.to).toBe(pid);
    }
    expect(s1.events.some((e) => e.e === 'GAME_ENDED')).toBe(true);

    // El replay de esa partida se verifica.
    const { replay } = await import('./replay.js');
    const r = replay(session.toReplay());
    expect(r.mismatch).toBeUndefined();
    expect(r.ok).toBe(true);

    await room.disconnect();
  }, 40000);
});
