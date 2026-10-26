import { useMemo, useState } from 'react';
import type { ActionType } from '@totem/core';
import { Tutorial, YOU } from '../tutorial/engine.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { describe } from '../state/subtitles.js';
import { audio } from '../audio/audio.js';
import { beatFor } from '../presenter/timelines.js';
import { PixelStage } from './PixelArt.js';
import './tutorial.css';

/** Tutorial gray-box: guiado, sin servidor, contra un bot scriptado. */
export function TutorialScreen(): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const t = makeT(lang);
  const setScreen = useStore((s) => s.setScreen);
  const tut = useMemo(() => new Tutorial(), []);
  const [, force] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const view = tut.view();
  const can = (a: ActionType): boolean => view.legal.includes(a);
  const slotActive =
    can('PEEK_INITIAL') ||
    can('EFFECT_TARGET') ||
    can('MATCH_ATTEMPT') ||
    (can('SWAP_DRAWN') && view.drawn !== undefined);
  const nameOf = (id: string): string => (id === YOU ? t('you') : t('tutorialBot'));

  const submit = (a: Parameters<Tutorial['submit']>[0]): void => {
    audio.unlock();
    const r = tut.submit(a);
    for (const e of r.events) {
      const b = beatFor(e);
      if (b.sfx) audio.play(b.sfx);
    }
    force((n) => n + 1);
  };

  if (tut.done) {
    return (
      <PixelStage>
        <main className="home">
          <section className="pixel-panel">
            <h2 className="panel-title">{t('tutorialDone')}</h2>
            <button type="button" className="pixel-btn primary" onClick={() => setScreen('home')}>
              {t('backHome')}
            </button>
          </section>
        </main>
      </PixelStage>
    );
  }

  return (
    <PixelStage>
      <main className="home tutorial">
        <section className="pixel-panel">
          <p className="banner">
            {t('tutorialStep')} {tut.stepNumber}/6 — {t(tut.step.textKey)}
          </p>
          <div className="piles">
            <div className="pile">
              <span className="muted">{t('deck')}</span>
              <div className="tut-card back" aria-hidden="true" />
            </div>
            <div className="pile">
              <span className="muted">{t('discard')}</span>
              <div className="tut-card face">{view.discardTop ?? '?'}</div>
            </div>
            {view.drawn ? (
              <div className="pile">
                <span className="muted">{t('heldCard')}</span>
                <div className="tut-card face drawn">{view.drawn.value ?? '?'}</div>
              </div>
            ) : null}
          </div>
          <div className="slots big">
            {view.you.slots.map((s, i) => {
              const acts = s !== 'empty' && slotActive;
              return (
                <button
                  key={i}
                  type="button"
                  className={`slot-cell ${s}${acts ? ' legal' : ''}${picks.includes(i) ? ' picked' : ''}`}
                  disabled={s === 'empty'}
                  aria-label={`${t('slot')} ${i + 1}`}
                  onClick={() => {
                    if (can('PEEK_INITIAL')) {
                      setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
                      return;
                    }
                    if (can('EFFECT_TARGET'))
                      return submit({ t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: i } });
                    if (can('SWAP_DRAWN') && view.drawn)
                      return submit({ t: 'SWAP_DRAWN', slot: i });
                    if (can('MATCH_ATTEMPT')) return submit({ t: 'MATCH_ATTEMPT', slot: i });
                  }}
                >
                  <kbd>{i + 1}</kbd>
                </button>
              );
            })}
          </div>
          <div className="row">
            {can('PEEK_INITIAL') ? (
              <button
                type="button"
                className="pixel-btn primary"
                disabled={picks.length === 0}
                onClick={() => {
                  submit({ t: 'PEEK_INITIAL', slots: picks });
                  setPicks([]);
                }}
              >
                {t('confirmPeek')} ({picks.length})
              </button>
            ) : null}
            {can('DRAW_DECK') ? (
              <button
                type="button"
                className="pixel-btn primary"
                onClick={() => submit({ t: 'DRAW_DECK' })}
              >
                {t('drawDeck')}
              </button>
            ) : null}
            {can('DISCARD_DRAWN') ? (
              <button
                type="button"
                className="pixel-btn"
                onClick={() => submit({ t: 'DISCARD_DRAWN' })}
              >
                {t('discardDrawn')}
              </button>
            ) : null}
            {can('CALL_ULTIMA') ? (
              <button
                type="button"
                className="pixel-btn primary"
                onClick={() => submit({ t: 'CALL_ULTIMA' })}
              >
                {t('callUltima')}
              </button>
            ) : null}
            <button
              type="button"
              className="pixel-btn"
              onClick={() => {
                tut.skip();
                setScreen('home');
              }}
            >
              {t('tutorialSkip')}
            </button>
          </div>
          <ul className="log-list">
            {tut.events
              .map((e) => describe(e, nameOf, lang))
              .filter((line): line is string => line !== null)
              .slice(-6)
              .map((line, i) => (
                <li key={i}>{line}</li>
              ))}
          </ul>
        </section>
      </main>
    </PixelStage>
  );
}
