import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTS, makeT } from './index.js';

describe('WP-15 · i18n (docs/01 §11, docs/02 §5.4)', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    const es = Object.keys(DICTS.es).sort();
    const en = Object.keys(DICTS.en).sort();
    expect(en).toEqual(es);
    expect(es.length).toBeGreaterThan(60);
  });

  it('ninguna traducción está vacía ni duplica literalmente el español por descuido', () => {
    // Claves cuya traducción es legítimamente idéntica en los dos idiomas.
    const SAME_BY_DESIGN = new Set([
      'bot',
      'error',
      'avatar',
      'total',
      'tutorial',
      'emotes',
      'statsFps',
      'statsDraws',
    ]);
    const unexpected: string[] = [];
    for (const key of Object.keys(DICTS.es) as (keyof typeof DICTS.es)[]) {
      expect(DICTS.es[key].length, key).toBeGreaterThan(0);
      expect(DICTS.en[key].length, key).toBeGreaterThan(0);
      if (DICTS.es[key] === DICTS.en[key] && !SAME_BY_DESIGN.has(key)) unexpected.push(key);
    }
    expect(unexpected, unexpected.join(', ')).toEqual([]);
  });

  it('makeT devuelve el idioma pedido', () => {
    expect(makeT('es')('settings')).toBe('Ajustes');
    expect(makeT('en')('settings')).toBe('Settings');
  });
});

describe('WP-15 · cero strings hardcodeados en la UI', () => {
  const uiDirs = ['ui', 'hud'];
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(full)) files.push(full);
    }
  };
  for (const d of uiDirs) walk(join(import.meta.dirname, '..', d));

  it('encuentra los componentes de UI', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it('todo texto visible pasa por el diccionario', () => {
    // Heurística: literales de texto entre etiquetas JSX con letras y espacio.
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const line of src.split('\n')) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
          continue;
        if (/=>|:\s*(Promise|JSX|React)|^(import|export|interface|type)\b/.test(line)) continue;
        const m = />\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}[^<>{}]{4,})</.exec(line);
        if (m && !/^\s*[A-Z_]+\s*$/.test(m[1] ?? '')) offenders.push(`${file}: ${m[1]?.trim()}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
