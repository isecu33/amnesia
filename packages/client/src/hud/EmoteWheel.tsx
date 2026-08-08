import { useState } from 'react';
import { useSettings } from '../settings/store.js';
import { makeT, type TKey } from '../i18n/index.js';

/** Rueda de 6 gestos no tóxicos con rate-limit local (docs/01 §11). */
export const EMOTES: { id: number; key: TKey; glyph: string }[] = [
  { id: 0, key: 'emoteHi', glyph: '👋' },
  { id: 1, key: 'emoteLaugh', glyph: '😄' },
  { id: 2, key: 'emoteSuspect', glyph: '🤨' },
  { id: 3, key: 'emoteClap', glyph: '👏' },
  { id: 4, key: 'emoteUff', glyph: '😮‍💨' },
  { id: 5, key: 'emoteHurry', glyph: '⏱' },
];

export const EMOTE_COOLDOWN_MS = 2500;

export function EmoteWheel({ onEmote }: { onEmote: (id: number) => void }): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(0);

  const fire = (id: number): void => {
    const now = Date.now();
    if (now - last < EMOTE_COOLDOWN_MS) return;
    setLast(now);
    setOpen(false);
    onEmote(id);
  };

  return (
    <div className="emotes">
      <button aria-label={t('emotes')} onClick={() => setOpen((v) => !v)}>
        ☺
      </button>
      {open ? (
        <div className="emote-wheel" role="menu">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              role="menuitem"
              aria-label={t(e.key)}
              title={t(e.key)}
              onClick={() => fire(e.id)}
            >
              {e.glyph}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
