import { describe, expect, it } from 'vitest';
import {
  ClientActionSchema,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  RateLimiter,
  EMOTE_COOLDOWN_MS,
  RoomConfigSchema,
  SPECIES_IDS,
  emoteReady,
  firstFreeSpecies,
  parseC2S,
  speciesOfAvatar,
  withinPayloadLimit,
} from './index.js';

describe('versión de protocolo', () => {
  it('es 2 (D-045: chooseSpecies)', () => expect(PROTOCOL_VERSION).toBe(2));
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
    expect(parseC2S('chooseSpecies', { species: 'bear' }).ok).toBe(true);
    expect(parseC2S('chooseSpecies', { species: 'dragon' }).ok).toBe(false);
    expect(parseC2S('chooseSpecies', {}).ok).toBe(false);
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

describe('elenco de animales (D-045)', () => {
  it('son 6, sin repetir', () => {
    expect(SPECIES_IDS).toHaveLength(6);
    expect(new Set(SPECIES_IDS).size).toBe(6);
  });
  it('speciesOfAvatar cae en el búho si el índice no existe', () => {
    expect(speciesOfAvatar(1)).toBe('fox');
    expect(speciesOfAvatar(99)).toBe('owl');
  });
  it('firstFreeSpecies respeta la preferencia y salta las cogidas', () => {
    expect(firstFreeSpecies(new Set(), 'bear')).toBe('bear');
    expect(firstFreeSpecies(new Set(['bear']), 'bear')).toBe('deer');
    expect(firstFreeSpecies(new Set(['crow']), 'crow')).toBe('owl');
  });
  it('firstFreeSpecies devuelve undefined con el elenco completo', () => {
    expect(firstFreeSpecies(new Set(SPECIES_IDS))).toBeUndefined();
  });
});

describe('enfriamiento de emotes (D-045)', () => {
  it('son 2 s por jugador', () => expect(EMOTE_COOLDOWN_MS).toBe(2000));
  it('el primero siempre pasa y el siguiente espera 2 s', () => {
    expect(emoteReady(undefined, 0)).toBe(true);
    expect(emoteReady(1000, 2999)).toBe(false);
    expect(emoteReady(1000, 3000)).toBe(true);
  });
});
