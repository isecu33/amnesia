/** `pnpm replay <fichero.json>` — re-simula y verifica una partida grabada. */
import { readFileSync } from 'node:fs';
import { replay } from './replay.js';
import type { ReplayFile } from './session.js';

const path = process.argv[2];
if (!path) {
  console.error('uso: pnpm replay <fichero.json>');
  process.exit(2);
}
const file = JSON.parse(readFileSync(path, 'utf8')) as ReplayFile;
const r = replay(file);
console.log(
  JSON.stringify(
    {
      file: path,
      ok: r.ok,
      steps: r.steps,
      finalPhase: r.finalPhase,
      totals: r.totals,
      mismatch: r.mismatch,
    },
    null,
    2,
  ),
);
process.exit(r.ok ? 0 : 1);
