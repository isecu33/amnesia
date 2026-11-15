#!/usr/bin/env node
/**
 * Sella la verificación: solo se ejecuta cuando la batería completa está en verde.
 * Lo llama el comando `/verify`. No lo llames a mano para saltarte el hook de Stop.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const dir = path.join(root, '.claude');
mkdirSync(dir, { recursive: true });
writeFileSync(
  path.join(dir, '.last-verify'),
  JSON.stringify({ at: Date.now(), iso: new Date().toISOString() }, null, 2) + '\n',
);
console.log('Verificación sellada.');
