import { describe, expect, it } from 'vitest';
import { TelemetryCollector, emptyTelemetry } from './telemetry.js';
import { GameSession, type Sink } from './session.js';
import { FakeClock } from './clock.js';
import { replay } from './replay.js';

describe('WP-17 · telemetría MVP (docs/02 §8)', () => {
  it('cuenta partidas, duración, aciertos de match y ÚLTIMA exitosa', () => {
    const t = new TelemetryCollector();
    t.gameStarted(1000);
    t.observe({ e: 'MATCH_OK', player: 'A', slot: 0, value: 3 });
    t.observe({ e: 'MATCH_OK', player: 'A', slot: 1, value: 3 });
    t.observe({ e: 'MATCH_FAIL', player: 'B', slot: 0, value: 2, penalty: 'card' });
    t.observe({ e: 'MATCH_REJECTED', player: 'C', reason: 'tooLate' });
    t.observe({ e: 'ULTIMA_CALLED', player: 'A' });
    t.observe({ e: 'ROUND_SCORED', scores: {}, ultimaSuccess: true });
    t.observe({ e: 'DECK_RESHUFFLED', deckCount: 10 });
    t.observe({ e: 'PLAYER_SEAT', player: 'B', controller: 'bot' });
    t.gameEnded(31000);

    const s = t.snapshot();
    expect(s.games).toBe(1);
    expect(s.matchAttempts).toBe(4);
    expect(s.matchOk).toBe(2);
    expect(s.totalDurationMs).toBe(30000);
    expect(s.reshuffles).toBe(1);
    expect(s.botSeats).toBe(1);

    const r = t.ratios();
    expect(r['matchHitRate']).toBe(0.5);
    expect(r['ultimaSuccessRate']).toBe(1);
    expect(r['avgGameMs']).toBe(30000);
    expect(JSON.parse(t.toLog())).toMatchObject({ msg: 'telemetry', games: 1 });
  });

  it('no registra ningún dato personal', () => {
    const t = new TelemetryCollector();
    t.observe({ e: 'MATCH_OK', player: 'nombre-del-jugador', slot: 0, value: 3 });
    expect(t.toLog()).not.toContain('nombre-del-jugador');
    expect(Object.values(emptyTelemetry()).every((v) => typeof v === 'number')).toBe(true);
  });

  it('una partida real por el servidor produce ratios coherentes', () => {
    const sink: Sink = { send: () => undefined, broadcast: () => undefined };
    const clock = new FakeClock();
    const session = new GameSession({ code: 'TELEM', clock, sink, seed: 5, rand: () => 0.4 });
    session.addBot('greedy');
    session.addBot('greedy');
    session.configure({ mode: 'quick' });
    session.start();
    for (let i = 0; i < 400 && session.gameState?.phase !== 'GAME_END'; i++) clock.advance(1000);
    const snap = session.telemetry.snapshot();
    expect(snap.games).toBe(1);
    expect(snap.rounds).toBeGreaterThanOrEqual(1);
    const r = session.telemetry.ratios();
    expect(r['matchHitRate']).toBeGreaterThanOrEqual(0);
    expect(r['matchHitRate']).toBeLessThanOrEqual(1);
    session.dispose();
  });
});

describe('WP-17 · un replay se convierte en test de regresión', () => {
  it('el replay de una partida real vuelve a verificar tras cualquier cambio', () => {
    const sink: Sink = { send: () => undefined, broadcast: () => undefined };
    const clock = new FakeClock();
    const session = new GameSession({ code: 'REGRE', clock, sink, seed: 777, rand: () => 0.31 });
    session.addBot('greedy');
    session.addBot('random');
    session.addBot('greedy');
    session.configure({ mode: 'classic', gameEndScore: 50 });
    session.start();
    for (let i = 0; i < 4000 && session.gameState?.phase !== 'GAME_END'; i++) clock.advance(1000);
    expect(session.gameState?.phase).toBe('GAME_END');

    const file = session.toReplay();
    const r = replay(file);
    expect(r.mismatch).toBeUndefined();
    expect(r.ok).toBe(true);
    // Determinismo: dos re-simulaciones dan lo mismo.
    expect(replay(file).totals).toEqual(r.totals);
    session.dispose();
  });
});

describe('WP-13 · revancha', () => {
  it('reinicia la partida con los mismos asientos y el marcador a cero', () => {
    const sink: Sink = { send: () => undefined, broadcast: () => undefined };
    const clock = new FakeClock();
    const session = new GameSession({ code: 'REVAN', clock, sink, seed: 12, rand: () => 0.77 });
    session.addBot('greedy');
    session.addBot('greedy');
    session.configure({ mode: 'quick' });
    session.start();
    expect(session.rematch()).toMatchObject({ error: 'GAME_NOT_FINISHED' });
    for (let i = 0; i < 400 && session.gameState?.phase !== 'GAME_END'; i++) clock.advance(1000);
    expect(session.gameState?.phase).toBe('GAME_END');
    const seatsBefore = session.seatList.map((s) => s.playerId);

    expect(session.rematch()).toBeUndefined();
    expect(session.gameState?.phase).toBe('INITIAL_PEEK');
    expect(session.seatList.map((s) => s.playerId)).toEqual(seatsBefore);
    for (const p of session.gameState?.players ?? []) expect(p.totalScore).toBe(0);
    session.dispose();
  });
});
