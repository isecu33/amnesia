import { describe, expect, it } from 'vitest';
import {
  ClientActionSchema,
  MAX_PAYLOAD_BYTES,
  DEFAULT_MAP_ID,
  MAP_IDS,
  PROTOCOL_VERSION,
  RateLimiter,
  RoomConfigSchema,
  parseC2S,
  resolveMapChoice,
  withinPayloadLimit,
} from './index.js';

describe('versión de protocolo', () => {
  it('es 2 (mapId cosmético en la config de sala, D-044)', () =>
    expect(PROTOCOL_VERSION).toBe(2));
});

describe('acciones de cliente', () => {
  it('acepta las formas válidas de docs/02 §3.4', () => {
    const valid = [
      { t: 'PEEK_INITIAL', slots: [0, 1] },
      { t: 'CALL_ULTIMA' },
      { t: 'DRAW_DECK' },
      { t: 'DRAW_DISCARD' },
      { t: 'DISCARD_DRAWN' },
      { t: 'SWAP_DRAWN', slot: 3 },
      { t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: 0 } },
      { t: 'EFFECT_TARGET', target: { kind: 'SPY', player: 'B', slot: 2 } },
      { t: 'EFFECT_TARGET', target: { kind: 'SWAP', ownSlot: 0, player: 'B', theirSlot: 1 } },
      { t: 'EFFECT_SKIP' },
      { t: 'MATCH_ATTEMPT', slot: 7 },
    ];
    for (const v of valid)
      expect(ClientActionSchema.safeParse(v).success, JSON.stringify(v)).toBe(true);
  });

  it('rechaza formas inválidas', () => {
    const invalid = [
      { t: 'TIMER_FIRED', timer: 'turn' }, // acción de servidor
      { t: 'START_ROUND' },
      { t: 'FORFEIT', p: 'A' },
      { t: 'SWAP_DRAWN', slot: -1 },
      { t: 'SWAP_DRAWN', slot: 99 },
      { t: 'SWAP_DRAWN' },
      { t: 'PEEK_INITIAL', slots: [] },
      { t: 'PEEK_INITIAL', slots: [0, 1, 2, 3] },
      { t: 'EFFECT_TARGET', target: { kind: 'NOPE' } },
      { t: 'NOPE' },
      {},
      null,
    ];
    for (const v of invalid) {
      expect(ClientActionSchema.safeParse(v).success, JSON.stringify(v)).toBe(false);
    }
  });

  it('ignora el tick del cliente en MATCH_ATTEMPT (strip)', () => {
    const r = ClientActionSchema.safeParse({ t: 'MATCH_ATTEMPT', slot: 1, tick: 999 });
    expect(r.success).toBe(true);
    if (r.success) expect('tick' in r.data).toBe(false);
  });
});

describe('parseC2S', () => {
  it('valida cada mensaje del catálogo', () => {
    expect(parseC2S('hello', { name: 'Iker', protocolVersion: 1 }).ok).toBe(true);
    expect(parseC2S('hello', { name: '', protocolVersion: 1 }).ok).toBe(false);
    expect(parseC2S('hello', { protocolVersion: 1 }).ok).toBe(false);
    expect(parseC2S('joinRoom', { code: 'ABCDE' }).ok).toBe(true);
    expect(parseC2S('joinRoom', { code: 'ABC' }).ok).toBe(false);
    expect(parseC2S('createRoom', {}).ok).toBe(true);
    expect(parseC2S('createRoom', { config: { turnSeconds: 30 } }).ok).toBe(true);
    expect(parseC2S('createRoom', { config: { turnSeconds: 5 } }).ok).toBe(false);
    expect(parseC2S('startGame', { bots: 2 }).ok).toBe(true);
    expect(parseC2S('startGame', { bots: 9 }).ok).toBe(false);
    expect(parseC2S('action', { a: { t: 'DRAW_DECK' } }).ok).toBe(true);
    expect(parseC2S('action', { a: { t: 'START_ROUND' } }).ok).toBe(false);
    expect(parseC2S('reconnect', { token: 'x'.repeat(20) }).ok).toBe(true);
    expect(parseC2S('reconnect', { token: 'x' }).ok).toBe(false);
    expect(parseC2S('emote', { id: 3 }).ok).toBe(true);
    expect(parseC2S('emote', { id: 99 }).ok).toBe(false);
    expect(parseC2S('addBot', { kind: 'greedy' }).ok).toBe(true);
    expect(parseC2S('addBot', { kind: 'ninja' }).ok).toBe(false);
  });

  it('rechaza tipos desconocidos', () => {
    const r = parseC2S('nope' as 'hello', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNKNOWN_MESSAGE');
  });

  it('rechaza payloads de más de 2 KB', () => {
    const big = { name: 'x'.repeat(MAX_PAYLOAD_BYTES + 10), protocolVersion: 1 };
    expect(withinPayloadLimit(big)).toBe(false);
    const r = parseC2S('hello', big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rechaza payloads no serializables', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(withinPayloadLimit(cyclic)).toBe(false);
  });
});

describe('config de sala', () => {
  it('acepta parciales dentro de rango y rechaza fuera de rango', () => {
    expect(RoomConfigSchema.safeParse({}).success).toBe(true);
    expect(RoomConfigSchema.safeParse({ mode: 'quick', timeScale: 1.5 }).success).toBe(true);
    expect(RoomConfigSchema.safeParse({ mode: 'coop' }).success).toBe(false);
    expect(RoomConfigSchema.safeParse({ gameEndScore: 10 }).success).toBe(false);
    expect(RoomConfigSchema.safeParse({ timeScale: 3 }).success).toBe(false);
  });
});

describe('rate limiting (docs/02 §4.2)', () => {
  it('deja pasar hasta el límite y luego bloquea en la ventana', () => {
    const rl = new RateLimiter(3, 1000);
    expect([rl.allow(0), rl.allow(10), rl.allow(20)]).toEqual([true, true, true]);
    expect(rl.allow(30)).toBe(false);
    expect(rl.allow(1100)).toBe(true);
  });
});

describe('mapa de sala (D-044)', () => {
  it('la config acepta los 5 mapas y «random»', () => {
    expect(MAP_IDS).toHaveLength(5);
    for (const mapId of [...MAP_IDS, 'random'])
      expect(RoomConfigSchema.safeParse({ mapId }).success, mapId).toBe(true);
  });

  it('rechaza mapas desconocidos o de otro tipo', () => {
    for (const mapId of ['castle', '', 'RANDOM', 3, null])
      expect(RoomConfigSchema.safeParse({ mapId }).success, String(mapId)).toBe(false);
    expect(parseC2S('configure', { config: { mapId: 'castle' } }).ok).toBe(false);
  });

  it('mapId es opcional y viaja en configure y createRoom', () => {
    expect(RoomConfigSchema.safeParse({}).success).toBe(true);
    expect(parseC2S('configure', { config: { mapId: 'frozen-cave' } })).toMatchObject({
      ok: true,
      data: { config: { mapId: 'frozen-cave' } },
    });
    expect(parseC2S('createRoom', { config: { mapId: 'random' } }).ok).toBe(true);
  });

  it('resolveMapChoice: sin elección, el mapa por defecto sin consumir azar', () => {
    const rand = (): number => {
      throw new Error('no debe consumir azar');
    };
    expect(resolveMapChoice(undefined, rand)).toBe(DEFAULT_MAP_ID);
    expect(DEFAULT_MAP_ID).toBe('candle-night');
  });

  it('resolveMapChoice: un mapa concreto se respeta tal cual', () => {
    for (const id of MAP_IDS) expect(resolveMapChoice(id, () => 0.99)).toBe(id);
  });

  it('resolveMapChoice: «random» usa el RNG inyectado y cubre todos los mapas', () => {
    const seen = new Set(
      [0, 0.21, 0.41, 0.61, 0.81, 0.999999].map((r) => resolveMapChoice('random', () => r)),
    );
    expect([...seen].sort()).toEqual([...MAP_IDS].sort());
    expect(resolveMapChoice('random', () => 0)).toBe(MAP_IDS[0]);
    expect(resolveMapChoice('random', () => 0.999999)).toBe(MAP_IDS[MAP_IDS.length - 1]);
  });
});
