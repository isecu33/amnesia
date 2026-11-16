/** P1 · modelo del anuncio de efecto: solo datos públicos, nunca bloquea (I2). */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@totem/core';
import {
  BANNER_LINGER_MS,
  STOLEN_SHOW_MS,
  bannerText,
  bannerVisible,
  nextBanner,
  stealFrac,
  type BannerCtx,
  type BannerModel,
} from './effect-banner.js';

const ctx = (nowMs: number): BannerCtx => ({ nowMs, windowMs: 1500 });
const names: Record<string, string> = { A: 'Ana', B: 'Bea' };
const name = (id: string): string => names[id] ?? '?';
const open = (owner: string, effect: 'PEEK' | 'SEER' | 'RUMBLE', at = 0): BannerModel =>
  nextBanner(
    undefined,
    { e: 'STEAL_WINDOW_OPENED', owner, effect, deadlineTick: 9 },
    ctx(at),
  ) as BannerModel;

describe('anuncio de efecto', () => {
  it('el C1 con efecto abre el cartel con la barra de la ventana de robo', () => {
    const ev: GameEvent = { e: 'DISCARDED_DRAWN', player: 'A', value: 9, effect: 'SPY' };
    const b = nextBanner(undefined, ev, ctx(1000));
    expect(b).toMatchObject({ kind: 'announce', effect: 'SPY', owner: 'A', windowEndsAt: 2500 });
    expect(stealFrac(b, 1000)).toBe(1);
    expect(stealFrac(b, 1750)).toBeCloseTo(0.5);
    expect(stealFrac(b, 3000)).toBe(0);
    expect(bannerVisible(b, 2500 + BANNER_LINGER_MS - 1)).toBe(true);
    expect(bannerVisible(b, 2500 + BANNER_LINGER_MS)).toBe(false);
  });

  it('un descarte sin efecto no anuncia nada', () => {
    const ev: GameEvent = { e: 'DISCARDED_DRAWN', player: 'A', value: 3 };
    expect(nextBanner(undefined, ev, ctx(0))).toBeUndefined();
  });

  it('STEAL_WINDOW_OPENED no reinicia la barra del mismo efecto', () => {
    const a = nextBanner(
      undefined,
      { e: 'DISCARDED_DRAWN', player: 'A', value: 9, effect: 'SPY' },
      ctx(0),
    );
    const b = nextBanner(
      a,
      { e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'SPY', deadlineTick: 9 },
      ctx(400),
    );
    expect(b).toBe(a);
  });

  it('STEAL_WINDOW_OPENED sin cartel previo (p. ej. tras colapsar) lo abre', () => {
    expect(open('B', 'RUMBLE', 10)).toMatchObject({
      kind: 'announce',
      owner: 'B',
      effect: 'RUMBLE',
    });
  });

  it('el efecto pendiente cierra el cartel enseguida', () => {
    const b = nextBanner(
      open('A', 'PEEK'),
      { e: 'EFFECT_PENDING', player: 'A', effect: 'PEEK', deadlineTick: 9 },
      ctx(800),
    );
    expect(bannerVisible(b, 800)).toBe(false);
    expect(stealFrac(b, 800)).toBe(0);
  });

  it('EFFECT_STOLEN reutiliza el cartel: «Bea roba Espionaje a Ana»', () => {
    const b = nextBanner(
      undefined,
      { e: 'EFFECT_STOLEN', thief: 'B', owner: 'A', effect: 'SPY' },
      ctx(0),
    ) as BannerModel;
    expect(bannerVisible(b, STOLEN_SHOW_MS - 1)).toBe(true);
    const t = bannerText(b, 'es', name, 'C');
    expect(t.by).toBe('¡Bea roba Espionaje a Ana!');
    expect(t.cta).toBeUndefined();
    expect(bannerText(b, 'es', name, 'A').by).toBe('¡Bea te roba Espionaje!');
  });

  it('textos del anuncio en es/en, con llamada a robar (o a conservarlo si es tuyo)', () => {
    const b = open('A', 'SEER');
    const es = bannerText(b, 'es', name, 'B');
    expect(es).toMatchObject({ title: 'Trueque Vidente', by: 'de Ana', icon: { effect: 'SEER' } });
    expect(es.cta).toBe('¡Roba el efecto con un Descarte Rápido!');
    expect(es.rule.length).toBeGreaterThan(5);
    expect(bannerText(b, 'en', name, 'B').cta).toBe('Steal the effect with a Quick Discard!');
    expect(bannerText(b, 'es', name, 'A').by).toBe('tu efecto');
  });

  it('el presagio se nombra con texto e icono, no solo color', () => {
    const b = nextBanner(undefined, { e: 'OMEN_CHANGED', omen: 'FLASH' }, ctx(0)) as BannerModel;
    expect(bannerText(b, 'es', name)).toMatchObject({ title: 'Destello', icon: { omen: 'FLASH' } });
    expect(nextBanner(undefined, { e: 'OMEN_CHANGED', omen: null }, ctx(0))).toBeUndefined();
  });

  it('el anuncio de efecto manda sobre un presagio a la vez', () => {
    const a = open('A', 'PEEK');
    expect(nextBanner(a, { e: 'OMEN_CHANGED', omen: 'CALM' }, ctx(100))).toBe(a);
  });

  it('I2: el cartel nunca lleva el valor de la carta', () => {
    const ev: GameEvent = { e: 'DISCARDED_DRAWN', player: 'A', value: 13, effect: 'SEER' };
    const b = nextBanner(undefined, ev, { nowMs: 0, windowMs: 1000 });
    expect(JSON.stringify(b)).not.toMatch(/13/);
  });
});
