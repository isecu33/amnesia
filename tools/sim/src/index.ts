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
  isPrivateEvent,
  type GameConfig,
  type GameEvent,
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
  return (
    s.deck.length + s.discard.length + inSlots + (s.drawn ? 1 : 0) + (s.drawnChoice?.length ?? 0)
  );
}

function serverActions(s: GameState): Action[] {
  switch (s.phase) {
    case 'INITIAL_PEEK':
      return [{ t: 'TIMER_FIRED', timer: 'peek' }];
    case 'TURN_DRAW':
    case 'TURN_RESOLVE':
      return [{ t: 'TIMER_FIRED', timer: 'turn' }];
    case 'STEAL_WINDOW':
      return [{ t: 'TIMER_FIRED', timer: 'steal' }];
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

/**
 * Cada partida rota las opciones de sala (bits de `g`): Salvaje, Presagios y
 * Kamikaze (esta última en Clásico con umbral bajo para que se alcance).
 */
function variantConfig(g: number, mode: 'quick' | 'classic'): Partial<GameConfig> {
  const kamikaze = (g & 4) !== 0;
  return {
    mode: kamikaze ? 'classic' : mode,
    wildModeEnabled: (g & 1) !== 0,
    omensEnabled: (g & 2) !== 0,
    kamikazeRule: kamikaze,
    ...(kamikaze ? { gameEndScore: 50, kamikazeResetScore: 25 } : {}),
  };
}

/** Eventos de reglas v2 que una campaña razonable debe haber visto al menos una vez. */
export const V2_EVENTS = [
  'STEAL_WINDOW_OPENED',
  'EFFECT_STOLEN',
  'CHAIN_LINK',
  'CHAIN_BROKEN',
  'OMEN_CHANGED',
  'DOUBLE_DRAW_PENDING',
  'WILD_GIFT',
] as const;

const PUBLIC_ID_LEAK = /"c\d\d"/;

/** Invariantes de las reglas v2 sobre una transición. */
function checkV2(
  g: number,
  step: number,
  prev: GameState,
  s: GameState,
  events: GameEvent[],
  violations: string[],
): void {
  const at = `g${g}#${step}`;
  for (const e of events) {
    // I2: ningún evento público lleva ids de carta.
    if (!isPrivateEvent(e) && PUBLIC_ID_LEAK.test(JSON.stringify(e))) {
      violations.push(`${at}: I2 — id de carta en el evento público ${e.e}`);
    }
    // I6: un sellado ni hace matches ni es objetivo de efectos.
    if (
      (e.e === 'MATCH_OK' || e.e === 'MATCH_FAIL') &&
      prev.players.find((p) => p.id === e.player)?.sealed
    ) {
      violations.push(`${at}: I6 — match de un sellado`);
    }
    if (e.e === 'EFFECT_RESOLVED') {
      for (const sl of e.publicInfo.slots) {
        if (prev.players.find((p) => p.id === sl.player)?.sealed) {
          violations.push(`${at}: I6 — sellado como objetivo de ${e.effect}`);
        }
      }
    }
    if (e.e === 'MATCH_OK' && e.owner && prev.players.find((p) => p.id === e.owner)?.sealed) {
      violations.push(`${at}: I6 — Salvaje sobre un sellado`);
    }
  }
  // #16: máximo un acierto por carrera, y ninguno con la carrera cerrada.
  const hits = events.filter((e) => e.e === 'MATCH_OK').length;
  if (hits > 1 || (hits === 1 && !prev.race.open)) {
    violations.push(`${at}: #16 — acierto fuera de carrera abierta`);
  }
  if (s.chain < 0) violations.push(`${at}: #16 — cadena negativa`);
  for (const p of s.players) {
    if (p.chainPoints > 0) violations.push(`${at}: #16 — premio de cadena positivo`);
  }
  // #14: coherencia de la ventana de robo.
  if (s.phase === 'STEAL_WINDOW' && (!s.pendingEffect || !s.effectOwner)) {
    violations.push(`${at}: #14 — ventana sin efecto ni dueño`);
  }
  if (s.phase !== 'STEAL_WINDOW' && s.phase !== 'EFFECT_TARGETING' && s.pendingEffect) {
    violations.push(`${at}: #14 — efecto pendiente fuera de ventana/targeting (${s.phase})`);
  }
  // #13: Doble Robo solo en TURN_RESOLVE y nunca junto a una carta robada simple.
  if (s.drawnChoice && (s.drawn || s.phase !== 'TURN_RESOLVE')) {
    violations.push(`${at}: #13 — drawnChoice inconsistente`);
  }
  // #15: sin omensEnabled jamás hay presagio.
  if (!s.config.omensEnabled && events.some((e) => e.e === 'OMEN_CHANGED')) {
    violations.push(`${at}: #15 — OMEN_CHANGED con presagios apagados`);
  }
  // #4: Kamikaze nunca deja a alguien exactamente en el umbral.
  if (s.config.kamikazeRule && s.config.mode === 'classic' && s.phase === 'ROUND_END') {
    for (const p of s.players) {
      if (p.totalScore === s.config.gameEndScore) violations.push(`${at}: #4 — total en el umbral`);
    }
  }
}

const coverage: Record<string, number> = {};

export function runSim(args: Args): SimResult {
  const violations: string[] = [];
  let finished = 0;
  let totalSteps = 0;
  let totalRounds = 0;

  for (let g = 0; g < args.games; g++) {
    const rnd = new Rnd(args.seed + g * 7919 + 1);
    const n = args.players > 0 ? args.players : 2 + rnd.int(5);
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
    let s = createGame(makeConfig(variantConfig(g, args.mode)), ids, args.seed + g);

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
      const prev = s;
      s = r.state;
      for (const e of r.events) coverage[e.e] = (coverage[e.e] ?? 0) + 1;
      checkV2(g, steps, prev, s, r.events, violations);
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

  if (args.games >= 200) {
    for (const ev of V2_EVENTS) {
      if (!coverage[ev]) violations.push(`cobertura: el fuzzer nunca vio ${ev}`);
    }
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
      coverage,
      ms,
    },
    null,
    2,
  ),
);
process.exit(result.violations.length === 0 && result.finished === args.games ? 0 : 1);
