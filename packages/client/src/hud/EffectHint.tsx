import { makeT, type Lang, type TKey } from '../i18n/index.js';

/** Instrucción del efecto o de la ventana de robo en curso (accesible: región `status`). */
export function EffectHint({
  hintKey,
  lang,
}: {
  hintKey: TKey | undefined;
  lang: Lang;
}): JSX.Element | null {
  if (!hintKey) return null;
  return (
    <p className="effect-hint" role="status" aria-live="polite">
      {makeT(lang)(hintKey)}
    </p>
  );
}
