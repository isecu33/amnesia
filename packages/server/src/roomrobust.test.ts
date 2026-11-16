/** Robustez de la sala: sola con bots, entrada sin validar, mensajes malformados. */
import { Server } from 'colyseus';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TotemRoom } from './room.js';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  const gameServer = new Server();
  gameServer.define('totem_room', TotemRoom);
  colyseus = await boot(gameServer, 2998);
});
afterAll(async () => {
  await colyseus.shutdown();
});

interface Box {
  errors: { code: string }[];
  joined?: { playerId: string; token: string };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listen(client: any): Box {
  const box: Box = { errors: [] };
  client.onMessage('err', (m: { code: string }) => box.errors.push(m));
  client.onMessage('joined', (m: { playerId: string; token: string }) => (box.joined = m));
  for (const t of ['view', 'ev', 'lobbyState', 'pong', 'emote'])
    client.onMessage(t, () => undefined);
  return box;
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('robustez de totem_room', () => {
  it('un humano solo contra bots que se cae puede volver con su token: la sala no se destruye', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 21 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    c1.send('hello', { name: 'Ana', protocolVersion: 2 });
    await wait(60);
    c1.send('addBot', { kind: 'greedy' });
    await wait(30);
    c1.send('startGame', {});
    await wait(60);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.started).toBe(true);
    const token = b1.joined?.token;
    await c1.leave();
    await wait(150);

    const back = await colyseus.connectTo(room, { name: 'Ana', token });
    const b2 = listen(back);
    back.send('hello', { name: 'Ana', protocolVersion: 2 });
    await wait(100);
    expect(b2.joined?.playerId).toBe('p1');
    expect(session.seatList.find((s) => s.playerId === 'p1')?.controller).toBe('human');
    await room.disconnect();
  }, 20000);

  it('un nombre que no es texto no tumba la entrada (options no pasan por zod)', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 22 });
    const c1 = await colyseus.connectTo(room, { name: 12345 as unknown as string });
    listen(c1);
    await wait(60);
    const session = (room as unknown as TotemRoom).sessionForTests;
    expect(session.seatList[0]?.name).toBe('Invitado');
    await room.disconnect();
  });

  it('mensajes malformados se rechazan con error y no cambian el estado', async () => {
    const room = await colyseus.createRoom('totem_room', { seed: 23 });
    const c1 = await colyseus.connectTo(room, { name: 'Ana' });
    const b1 = listen(c1);
    c1.send('hello', { name: 'Ana', protocolVersion: 2 });
    await wait(50);
    c1.send('action', { a: { t: 'SWAP_DRAWN' } }); // sin slot
    await wait(120);
    c1.send('action', { a: { t: 'TIMER_FIRED', timer: 'turn' } }); // acción de servidor
    await wait(120);
    c1.send('configure', { config: { turnSeconds: 1 } });
    await wait(120);
    c1.send('emote', { id: 99 });
    await wait(120);
    expect(b1.errors.map((e) => e.code)).toEqual([
      'BAD_PAYLOAD',
      'BAD_PAYLOAD',
      'BAD_PAYLOAD',
      'BAD_PAYLOAD',
    ]);
    await room.disconnect();
  });
});
