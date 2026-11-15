#!/usr/bin/env node
/**
 * SessionStart · inyecta el estado real del repo al abrir una sesión, para que el
 * agente no empiece preguntando lo que puede mirar: rama, últimos commits,
 * trabajo sin commitear y últimos ADRs.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const sh = (cmd) => {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const branch = sh('git rev-parse --abbrev-ref HEAD') || '(sin git)';
const log = sh('git log --oneline -5');
const dirty = sh('git status --short');

let adrs = '';
try {
  const decisiones = readFileSync(path.join(root, 'docs', 'decisiones.md'), 'utf8');
  adrs = decisiones
    .split('\n')
    .filter((l) => /^##\s+D-\d+/.test(l))
    .slice(-5)
    .join('\n');
} catch {
  /* sin registro de decisiones */
}

const context = [
  '## Estado del repo al abrir la sesión',
  `Rama: **${branch}**`,
  '',
  '### Últimos commits',
  '```',
  log || '(sin commits)',
  '```',
  dirty ? '### Trabajo sin commitear\n```\n' + dirty + '\n```' : '### Árbol de trabajo limpio',
  adrs ? '### Últimas decisiones registradas\n' + adrs : '',
  '',
  'Recuerda: los docs mandan sobre el código. Un WP por conversación y por PR.',
]
  .filter(Boolean)
  .join('\n');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }),
);
