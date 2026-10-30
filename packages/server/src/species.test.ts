import { describe, expect, it } from 'vitest';
import { SPECIES_IDS, type Seat } from '@totem/protocol';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';

function lobby() {
  const sink: Sink = { send: () => undefined, broadcast: () => undefined };
  const session = new GameSession({ code: 'ABCDE', clock: new FakeClock(), sink, seed: 3 });
  const speciesOf = (): (string | undefined)[] => session.seatList.map((s: Seat) => s.species);
  return { session, speciesOf };
}

const idOf = (r: { playerId: string } | { error: string }): string => {
  if ('error' in r) throw new Error(r.error);
  return r.playerId;
};

describe('reserva de animal en la sala (D-045)', () => {
  it('cada asiento recibe un animal distinto, empezando por la preferencia del avatar', () => {
    const { session } = lobby();
    session.addHuman('A', 3); // oso
    session.addHuman('B', 3); // oso ocupado: toma el siguiente libre
    expect(session.seatList.map((s) => s.species)).toEqual(['bear', 'deer']);
  });

  it('los bots reservan también un animal libre', () => {
    const { session, speciesOf } = lobby();
    session.addHuman('A');
    for (let i = 0; i < 5; i++) session.addBot('random');
    const all = speciesOf();
    expect(new Set(all).size).toBe(6);
    expect([...SPECIES_IDS].every((s) => all.includes(s))).toBe(true);
  });

  it('elegir un animal libre lo reserva y libera el anterior', () => {
    const { session, speciesOf } = lobby();
    const a = idOf(session.addHuman('A', 0)); // búho
    expect(session.chooseSpecies(a, 'crow')).toBeUndefined();
    expect(speciesOf()).toEqual(['crow']);
    const b = idOf(session.addHuman('B', 9)); // cuervo ocupado -> búho
    expect(session.seatList.find((s) => s.playerId === b)?.species).toBe('owl');
  });

  it('elegir un animal ocupado se rechaza y NO reasigna nada en silencio', () => {
    const { session, speciesOf } = lobby();
    session.addHuman('A', 0);
    const b = idOf(session.addHuman('B', 1));
    const before = speciesOf();
    expect(session.chooseSpecies(b, 'owl')).toEqual({ error: 'SPECIES_TAKEN' });
    expect(speciesOf()).toEqual(before);
  });

  it('elegir el propio animal es idempotente', () => {
    const { session } = lobby();
    const a = idOf(session.addHuman('A', 0));
    expect(session.chooseSpecies(a, 'owl')).toBeUndefined();
  });

  it('un asiento que sale libera su animal', () => {
    const { session } = lobby();
    const a = idOf(session.addHuman('A', 0));
    const b = idOf(session.addHuman('B', 1));
    session.removeSeat(a);
    expect(session.chooseSpecies(b, 'owl')).toBeUndefined();
  });

  it('no se puede cambiar de animal con la partida empezada', () => {
    const { session } = lobby();
    const a = idOf(session.addHuman('A', 0));
    session.addHuman('B', 1);
    expect(session.start()).toBeUndefined();
    expect(session.chooseSpecies(a, 'crow')).toEqual({ error: 'GAME_ALREADY_STARTED' });
  });

  it('rechaza a quien no es un jugador humano de la sala', () => {
    const { session } = lobby();
    session.addHuman('A');
    const bot = idOf(session.addBot('random'));
    expect(session.chooseSpecies('p99', 'crow')).toEqual({ error: 'NOT_A_PLAYER' });
    expect(session.chooseSpecies(bot, 'crow')).toEqual({ error: 'NOT_A_PLAYER' });
  });
});
