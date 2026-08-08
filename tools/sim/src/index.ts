/**
 * Fuzzing de partidas bot-vs-bot contra `core` — I10 (docs/02 §3.8, §7).
 * Uso: pnpm sim -- --games 500 [--players 3] [--mode quick|classic] [--seed 0]
 */
import {
  apply,
  createGame,
  legalActions,
  makeConfig,
  mulberry32,
  viewFor,
  type Action,
  type GameState,
} from '@totem/core';

interface Args {
  games: number;
  players: number;
  mode: 'quick' | 'classic';
  seed: number;
  maxSteps: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, def: number): number => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
  };
  const mi = argv.indexOf('--mode');
  const mode = mi >= 0 && argv[mi + 1] === 'classic' ? 'classic' : 'quick';
  return {
    games: get('games', 500),
    players: get('players', 0),
    mode,
    seed: get('seed', 0),
    maxSteps: get('maxSteps', 6000),
  };
}

class Rnd {
  private n: number;
  constructor(seed: number) {
    this.n = seed >>> 0;
  }
  next(): number {
    this.n = (this.n + 0x9e3779b9) >>> 0;
    return mulberry32(this.n);
  }
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}

function cards(s: GameState): number {
  const inSlots = s.players.reduce((n, p) => n + p.slots.filter((x) => x !== null).length, 0);
  return s.deck.length + s.discard.length + inSlots + (s.drawn ? 1 : 0);
}

function serverActions(s: GameState): Action[] {
  switch (s.phase) {
    case 'INITIAL_PEEK':
      return [{ t: 'TIMER_FIRED', timer: 'peek' }];
    case 'TURN_DRAW':
    case 'TURN_RESOLVE':
      return [{ t: 'TIMER_FIRED', timer: 'turn' }];
    case 'EFFECT_TARGETING':
      return [{ t: 'TIMER_FIRED', timer: 'effect' }];
    case 'ROUND_REVEAL':
      return [{ t: 'TIMER_FIRED', timer: 'reveal' }];
    case 'ROUND_END':
      return [{ t: 'START_ROUND' }];
    default:
      return [];
  }
}

export interface SimResult {
  games: number;
  finished: number;
  violations: string[];
  avgSteps: number;
  avgRounds: number;
}

export function runSim(args: Args): SimResult {
  const violations: string[] = [];
  let finished = 0;
  let totalSteps = 0;
  let totalRounds = 0;

  for (let g = 0; g < args.games; g++) {
    const rnd = new Rnd(args.seed + g * 7919 + 1);
    const n = args.players > 0 ? args.players : 2 + rnd.int(5);
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
    let s = createGame(makeConfig({ mode: args.mode }), ids, args.seed + g);

    let steps = 0;
    for (; steps < args.maxSteps && s.phase !== 'GAME_END'; steps++) {
      const pool: Action[] = [];
      for (const p of s.players) pool.push(...legalActions(s, p.id));
      pool.push(...serverActions(s));
      if (pool.length === 0) break;
      const chosen = pool[rnd.int(pool.length)] as Action;
      const a: Action = { ...chosen, tick: s.tick + 50 + rnd.int(1500) };
      const before = JSON.stringify(s);
      const r = apply(s, a);
      if (!r.ok) {
        if (JSON.stringify(s) !== before)
          violations.push(`g${g}: I3 — estado mutado tras ok:false`);
        continue;
      }
      s = r.state;
      // I1
      if (cards(s) !== 52) violations.push(`g${g}#${steps}: I1 — ${cards(s)} cartas`);
      // I2 (barato): ninguna vista lleva ids de carta
      for (const p of s.players) {
        if (/"c\d\d"/.test(JSON.stringify(viewFor(s, p.id)))) {
          violations.push(`g${g}#${steps}: I2 — id de carta en la vista de ${p.id}`);
        }
      }
      // I8
      for (const p of s.players) {
        if (p.slots.length > s.config.maxSlots)
          violations.push(`g${g}#${steps}: I8 — mano > maxSlots`);
      }
    }
    totalSteps += steps;
    totalRounds += s.round;
    if (s.phase === 'GAME_END') finished++;
    else violations.push(`g${g}: no terminó en ${args.maxSteps} pasos (fase ${s.phase})`);
  }

  return {
    games: args.games,
    finished,
    violations,
    avgSteps: Math.round(totalSteps / args.games),
    avgRounds: Math.round((totalRounds / args.games) * 10) / 10,
  };
}

const args = parseArgs(process.argv.slice(2));
const t0 = Date.now();
const result = runSim(args);
const ms = Date.now() - t0;
console.log(
  JSON.stringify(
    {
      ...args,
      finished: result.finished,
      avgSteps: result.avgSteps,
      avgRounds: result.avgRounds,
      violations: result.violations.slice(0, 20),
      violationCount: result.violations.length,
      ms,
    },
    null,
    2,
  ),
);
process.exit(result.violations.length === 0 && result.finished === args.games ? 0 : 1);
