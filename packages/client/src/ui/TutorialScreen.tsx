import { useMemo, useState } from 'react';
import type { ActionType } from '@totem/core';
import { Tutorial } from '../tutorial/engine.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { audio } from '../audio/audio.js';
import { beatFor } from '../presenter/timelines.js';

/** Tutorial gray-box: guiado, sin servidor, contra un bot scriptado. */
export function TutorialScreen(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const setScreen = useStore((s) => s.setScreen);
  const tut = useMemo(() => new Tutorial(), []);
  const [, force] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const view = tut.view();
  const can = (a: ActionType): boolean => view.legal.includes(a);

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
      <main className="panel">
        <h2>{t('tutorialDone')}</h2>
        <button onClick={() => setScreen('home')}>{t('backHome')}</button>
      </main>
    );
  }

  return (
    <main className="panel tutorial">
      <p className="banner">
        {t('tutorialStep')} {tut.stepNumber}/6 — {t(tut.step.textKey)}
      </p>
      <div className="row">
        <span className="muted">{t('discard')}</span>
        <div className="card face">{view.discardTop ?? '?'}</div>
        {view.drawn ? <div className="card drawn">{view.drawn.value ?? '?'}</div> : null}
      </div>
      <div className="slots big">
        {view.you.slots.map((s, i) => (
          <button
            key={i}
            className={`card ${s}${picks.includes(i) ? ' picked' : ''}`}
            disabled={s === 'empty'}
            onClick={() => {
              if (can('PEEK_INITIAL')) {
                setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
                return;
              }
              if (can('EFFECT_TARGET'))
                return submit({ t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: i } });
              if (can('SWAP_DRAWN') && view.drawn) return submit({ t: 'SWAP_DRAWN', slot: i });
              if (can('MATCH_ATTEMPT')) return submit({ t: 'MATCH_ATTEMPT', slot: i });
            }}
          >
            {s === 'empty' ? '·' : i}
          </button>
        ))}
      </div>
      <div className="row">
        {can('PEEK_INITIAL') ? (
          <button
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
          <button onClick={() => submit({ t: 'DRAW_DECK' })}>{t('drawDeck')}</button>
        ) : null}
        {can('DISCARD_DRAWN') ? (
          <button onClick={() => submit({ t: 'DISCARD_DRAWN' })}>{t('discardDrawn')}</button>
        ) : null}
        {can('CALL_ULTIMA') ? (
          <button onClick={() => submit({ t: 'CALL_ULTIMA' })}>{t('callUltima')}</button>
        ) : null}
        <button
          onClick={() => {
            tut.skip();
            setScreen('home');
          }}
        >
          {t('tutorialSkip')}
        </button>
      </div>
      <ul className="log-list">
        {tut.events.slice(-6).map((e, i) => (
          <li key={i}>{e.e}</li>
        ))}
      </ul>
    </main>
  );
}
