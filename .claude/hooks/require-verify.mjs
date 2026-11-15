#!/usr/bin/env node
/**
 * Stop · se ejecuta cuando el agente cree que ha terminado.
 *
 * La Definition of Done de CLAUDE.md dice: «Antes de dar nada por terminado:
 * `pnpm -r typecheck && pnpm -r test` en verde». Este hook comprueba que eso ha
 * pasado DESPUÉS de la última edición de código, y bloquea una sola vez si no.
 *
 * El marcador lo escribe `/verify` (o `node .claude/hooks/mark-verified.mjs`)
 * cuando la batería sale en verde.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

function read(stream) {
  return new Promise((resolve) => {
    let raw = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => (raw += c));
    stream.on('end', () => resolve(raw));
  });
}

const input = JSON.parse((await read(process.stdin)) || '{}');

// Ya bloqueamos una vez en este ciclo: no insistas (evita bucles).
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const marker = path.join(root, '.claude', '.last-verify');

let verifiedAt = 0;
try {
  verifiedAt = JSON.parse(readFileSync(marker, 'utf8')).at ?? 0;
} catch {
  verifiedAt = 0;
}

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', 'replays', 'test-results']);
let newest = 0;
let newestFile = '';

const walk = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(e.name)) {
      const m = statSync(full).mtimeMs;
      if (m > newest) {
        newest = m;
        newestFile = path.relative(root, full);
      }
    }
  }
};

for (const p of ['packages', 'tools']) walk(path.join(root, p));

if (newest <= verifiedAt) process.exit(0);

console.error(
  [
    'La Definition of Done no está cumplida: hay código modificado después de la última verificación.',
    `Más reciente: ${newestFile}`,
    '',
    'Ejecuta la batería y no des la tarea por terminada hasta tenerla en verde:',
    '',
    '  pnpm -r typecheck && pnpm -r test && pnpm -r lint',
    '  pnpm --filter @totem/core test:cov     # cobertura >= 90 %',
    '  pnpm sim -- --games 500                # fuzz I1-I10',
    '  node .claude/hooks/mark-verified.mjs   # solo cuando TODO esté en verde',
    '',
    'Si algo falla, arréglalo; no marques verificado a mano para saltarte esto.',
  ].join('\n'),
);
process.exit(2);
