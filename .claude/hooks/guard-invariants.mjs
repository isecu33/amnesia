#!/usr/bin/env node
/**
 * PostToolUse · se ejecuta tras cada Edit/Write.
 *
 * Bloquea (exit 2) las violaciones de las «reglas de oro» de CLAUDE.md que son
 * comprobables mirando un solo fichero. Lo que necesita ver el repo entero
 * (I2 real, cobertura, determinismo) NO va aquí: eso es trabajo de /verify y del
 * fuzz. Este hook existe para cortar la deriva en el momento en que se escribe,
 * que es cuando es barata de arreglar.
 *
 * Escape hatch: una línea con `// totem-allow: <motivo>` exime a la línea anterior
 * o a la propia línea. Úsalo poco y justifícalo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const NL = '\n';

function read(stream) {
  return new Promise((resolve) => {
    let raw = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => (raw += c));
    stream.on('end', () => resolve(raw));
  });
}

const raw = await read(process.stdin);
let input;
try {
  input = JSON.parse(raw || '{}');
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = path.relative(root, file).split(path.sep).join('/');
if (!rel || rel.startsWith('..')) process.exit(0);
if (!/\.(ts|tsx|js|mjs)$/.test(rel)) process.exit(0);
if (/(^|\/)(node_modules|dist|coverage)\//.test(rel)) process.exit(0);

let src;
try {
  src = readFileSync(file, 'utf8');
} catch {
  process.exit(0);
}

const lines = src.split(NL);
const isTest = /\.test\.tsx?$/.test(rel);
const inCore = rel.startsWith('packages/core/src/');
const inClientUi = /^packages\/client\/src\/.*\.(tsx|ts)$/.test(rel);

const problems = [];
const allow = (i) =>
  /\/\/\s*totem-allow:/.test(lines[i] ?? '') || /\/\/\s*totem-allow:/.test(lines[i - 1] ?? '');

const flag = (i, rule, msg) => {
  if (allow(i)) return;
  problems.push(`${rel}:${i + 1}  [${rule}] ${msg}`);
};

lines.forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, '');

  // Regla de oro nº4 — prohibido `any` en todo el repo.
  if (/(:\s*any\b|\bas\s+any\b|<any>|Array<any>|Promise<any>)/.test(code)) {
    flag(i, 'CLAUDE.md#4', 'prohibido `any`; tipa el valor o usa `unknown` + narrowing.');
  }

  // Regla de oro nº1 — packages/core es PURO.
  if (inCore && !isTest) {
    if (/\bMath\.random\s*\(/.test(code))
      flag(i, 'CLAUDE.md#1 / I-pureza', 'core es puro: usa el RNG inyectado de `rng.ts`.');
    if (/\bDate\.now\s*\(|new\s+Date\s*\(|performance\.now\s*\(/.test(code))
      flag(
        i,
        'CLAUDE.md#1 / I-pureza',
        'core es puro: el tiempo entra por acciones TIMER_FIRED / tick.',
      );
    if (/\b(setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\s*\(/.test(code))
      flag(i, 'CLAUDE.md#1 / I-pureza', 'core es puro: cero temporizadores, cero asincronía.');
    if (/\bfrom\s+['"](node:|fs|path|crypto|http|os)['"]/.test(code))
      flag(i, 'CLAUDE.md#1 / I-pureza', 'core es puro: cero IO, cero dependencias de runtime.');
    if (/\bconsole\.\w+\s*\(/.test(code))
      flag(i, 'CLAUDE.md#1 / I-pureza', 'core es puro: nada de logging; devuelve eventos.');
  }

  // Regla de oro nº8 + docs/03 §7.4 — todo TODO lleva su WP de destino.
  if (/\b(TODO|FIXME|HACK)\b/.test(line) && !/\bTODO\(WP-\d\d\)/.test(line)) {
    flag(i, 'docs/03 §7', 'todo TODO debe llevar su WP de destino: `TODO(WP-13): …`.');
  }

  // WP-15 — cero strings hardcodeados en la UI (i18n es/en).
  if (inClientUi && !isTest) {
    const attr = code.match(
      /\b(placeholder|title|aria-label|alt)\s*=\s*"([^"{}]*[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}[^"{}]*)"/,
    );
    if (attr) {
      flag(
        i,
        'WP-15',
        `atributo con texto literal ("${attr[2]}"): pásalo por el diccionario i18n.`,
      );
    }
  }
});

// Regla de oro nº5 — nada de números mágicos de juego fuera de config.ts.
if (inCore && !isTest && !rel.endsWith('/config.ts')) {
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // Constantes de tiempo o de puntuación pegadas al código son la señal.
    if (/\b\d{3,}\s*(\/\/.*)?$/.test(code) && /(ms|Ms|tick|Tick|points|Points|score)/.test(code)) {
      flag(
        i,
        'CLAUDE.md#5',
        'número mágico de juego: llévalo a `core/src/config.ts` (tabla docs/01 §9).',
      );
    }
  });
}

if (problems.length === 0) process.exit(0);

console.error(
  [
    `Guardia de invariantes: ${problems.length} violación(es) en el fichero que acabas de escribir.`,
    '',
    ...problems,
    '',
    'Corrígelas antes de seguir. Si alguna es un falso positivo justificado, añade',
    '`// totem-allow: <motivo>` en esa línea y explica el motivo en el resumen final.',
  ].join(NL),
);
process.exit(2);
