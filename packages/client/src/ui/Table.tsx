import { useEffect, useState } from 'react';
import type { ActionType } from '@totem/core';
import { act } from '../net/client.js';
import { useStore } from '../state/store.js';
import { makeT } from '../i18n/index.js';

/** Gray-box: rectángulos y botones. La UI habilita SOLO lo que dice view.legal. */
export function Table(): JSX.Element {
  const t = makeT(useStore((s) => s.lang));
  const view = useStore((s) => s.view);
  const names = useStore((s) => s.names);
  const log = useStore((s) => s.log);
  const reveal = useStore((s) => s.reveal);
  const [peek, setPeek] = useState<number[]>([]);
  const [swapMode, setSwapMode] = useState(false);
  const [target, setTarget] = useState<{ player: string; slot: number } | null>(null);

  useEffect(() => {
    if (view?.phase !== 'INITIAL_PEEK') setPeek([]);
    if (view?.phase !== 'TURN_RESOLVE') setSwapMode(false);
    if (view?.phase !== 'EFFECT_TARGETING') setTarget(null);
  }, [view?.phase]);

  if (!view) return <main className="panel">{t('connecting')}</main>;
  const can = (a: ActionType): boolean => view.legal.includes(a);
  const name = (id: string): string => names[id] ?? id;
  const isMyTurn = view.activePlayer === view.you.id;

  const onOwnSlot = (slot: number): void => {
    if (view.phase === 'INITIAL_PEEK' && can('PEEK_INITIAL')) {
      setPeek((p) => (p.includes(slot) ? p.filter((x) => x !== slot) : [...p, slot]));
      return;
    }
    if (view.phase === 'EFFECT_TARGETING' && can('EFFECT_TARGET')) {
      // Vislumbre sobre slot propio, o primera mitad de un Trueque.
      act({ t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot } });
      setTarget({ player: view.you.id, slot });
      return;
    }
    if (swapMode && can('SWAP_DRAWN')) {
      act({ t: 'SWAP_DRAWN', slot });
      setSwapMode(false);
      return;
    }
    if (can('MATCH_ATTEMPT')) act({ t: 'MATCH_ATTEMPT', slot });
  };

  const onRivalSlot = (player: string, slot: number): void => {
    if (view.phase !== 'EFFECT_TARGETING' || !can('EFFECT_TARGET')) return;
    if (target && target.player === view.you.id) {
      act({
        t: 'EFFECT_TARGET',
        target: { kind: 'SWAP', ownSlot: target.slot, player, theirSlot: slot },
      });
      setTarget(null);
      return;
    }
    act({ t: 'EFFECT_TARGET', target: { kind: 'SPY', player, slot } });
  };

  return (
    <main className="table">
      <section className="status">
        <span>
          {t('turnOf')} <strong>{name(view.activePlayer)}</strong>
          {isMyTurn ? ` (${t('you')})` : ''}
        </span>
        <span>
          {t('orbit')} {view.orbit}
        </span>
        <span>
          {t('phase')} {view.phase}
        </span>
        {view.you.lockedForMs > 0 ? (
          <span className="danger">
            {t('locked')} {Math.ceil(view.you.lockedForMs / 1000)}s
          </span>
        ) : null}
      </section>

      <section className="center">
        <div className="pile">
          <div className="label">{t('deck')}</div>
          <div className="card back">{view.deckCount}</div>
        </div>
        <div className="pile">
          <div className="label">{t('discard')}</div>
          <div className="card face">{view.discardTop ?? '?'}</div>
        </div>
        {view.drawn ? (
          <div className="pile">
            <div className="label">{t('inHand')}</div>
            <div className="card drawn">{view.drawn.value ?? '?'}</div>
          </div>
        ) : null}
      </section>

      <section className="rivals">
        {view.others.map((o) => (
          <div key={o.id} className={`rival${o.sealed ? ' sealed' : ''}`}>
            <div className="label">
              {name(o.id)} {o.controller === 'bot' ? '🤖' : ''} {o.sealed ? '🔒' : ''} ·{' '}
              {view.scores[o.id]?.total ?? 0}
            </div>
            <div className="slots">
              {o.slots.map((s, i) => (
                <button
                  key={i}
                  className={`card ${s}`}
                  disabled={
                    view.phase !== 'EFFECT_TARGETING' || !can('EFFECT_TARGET') || s === 'empty'
                  }
                  onClick={() => onRivalSlot(o.id, i)}
                  title={`${name(o.id)} #${i}`}
                >
                  {s === 'empty' ? '·' : i}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mine">
        <div className="label">
          {t('yourTotems')} · {view.scores[view.you.id]?.total ?? 0} {view.you.sealed ? '🔒' : ''}
        </div>
        <div className="slots big">
          {view.you.slots.map((s, i) => {
            const revealed = reveal && reveal.player === view.you.id && reveal.slot === i;
            return (
              <button
                key={i}
                className={`card ${s}${peek.includes(i) ? ' picked' : ''}${revealed ? ' revealed' : ''}`}
                disabled={s === 'empty'}
                onClick={() => onOwnSlot(i)}
                title={`#${i}`}
              >
                {revealed ? reveal.value : s === 'empty' ? '·' : i}
              </button>
            );
          })}
        </div>
        {reveal && reveal.player !== view.you.id ? (
          <div className="banner">
            👁 {name(reveal.player)} #{reveal.slot} = <strong>{reveal.value}</strong>
          </div>
        ) : null}
      </section>

      <section className="actions">
        {view.phase === 'INITIAL_PEEK' ? (
          <>
            <span className="muted">{t('peekPrompt')}</span>
            <button
              disabled={!can('PEEK_INITIAL') || peek.length === 0}
              onClick={() => {
                act({ t: 'PEEK_INITIAL', slots: peek });
                setPeek([]);
              }}
            >
              {t('confirmPeek')} ({peek.length})
            </button>
          </>
        ) : null}
        <button disabled={!can('DRAW_DECK')} onClick={() => act({ t: 'DRAW_DECK' })}>
          {t('drawDeck')}
        </button>
        <button disabled={!can('DRAW_DISCARD')} onClick={() => act({ t: 'DRAW_DISCARD' })}>
          {t('drawDiscard')}
        </button>
        <button disabled={!can('DISCARD_DRAWN')} onClick={() => act({ t: 'DISCARD_DRAWN' })}>
          {t('discardDrawn')}
        </button>
        <button
          disabled={!can('SWAP_DRAWN')}
          className={swapMode ? 'active' : ''}
          onClick={() => setSwapMode((v) => !v)}
        >
          {t('swapHint')}
        </button>
        <button disabled={!can('CALL_ULTIMA')} onClick={() => act({ t: 'CALL_ULTIMA' })}>
          {t('callUltima')}
        </button>
        <button disabled={!can('EFFECT_SKIP')} onClick={() => act({ t: 'EFFECT_SKIP' })}>
          {t('skipEffect')}
        </button>
        <span className="muted small">
          {can('MATCH_ATTEMPT') ? t('matchHint') : ''}
          {view.phase === 'EFFECT_TARGETING' && can('EFFECT_TARGET') ? ` ${t('targetPrompt')}` : ''}
        </span>
      </section>

      <section className="log">
        <div className="label">{t('log')}</div>
        <ul>
          {log
            .slice(-14)
            .reverse()
            .map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
        </ul>
      </section>
    </main>
  );
}
