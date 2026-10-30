import { useState } from 'react';
import { useSettings } from '../settings/store.js';
import { makeT, type TKey } from '../i18n/index.js';
import { EMOTE_COOLDOWN_MS, emoteReady } from '@totem/protocol';
import { EmoteIcon } from './EmoteIcon.js';

/** Rueda de 6 gestos no tóxicos con rate-limit local (docs/01 §11). */
/** Los 6 ids del protocolo; el icono pixel de cada uno vive en emote-icons.ts (D-045). */
export const EMOTES: { id: number; key: TKey }[] = [
  { id: 0, key: 'emoteHi' },
  { id: 1, key: 'emoteLaugh' },
  { id: 2, key: 'emoteSuspect' },
  { id: 3, key: 'emoteClap' },
  { id: 4, key: 'emoteUff' },
  { id: 5, key: 'emoteHurry' },
];

/** Mismo enfriamiento que aplica el servidor (2 s por jugador). */
export { EMOTE_COOLDOWN_MS };

export function EmoteWheel({ onEmote }: { onEmote: (id: number) => void }): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<number | undefined>(undefined);

  const fire = (id: number): void => {
    const now = Date.now();
    if (!emoteReady(last, now)) return;
    setLast(now);
    setOpen(false);
    onEmote(id);
  };

  return (
    <div className="emotes">
      <button
        type="button"
        className="emote-btn"
        aria-label={t('emotes')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 14" aria-hidden="true">
          <path d="M1 0h14v2h1v8h-1v2H7v2H5v-2H3v-2H1v-2H0V2h1z" />
        </svg>
        {t('emotes')}
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
              <EmoteIcon id={e.id} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
