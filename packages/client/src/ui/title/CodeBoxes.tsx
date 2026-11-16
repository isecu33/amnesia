/**
 * Código de sala como 5 casillas pixel. Por debajo hay UN input real (accesible,
 * pegar funciona, teclado móvil en mayúsculas) superpuesto e invisible; las
 * casillas solo pintan su valor y el cursor.
 */
import { useState } from 'react';
import { CODE_LENGTH } from '@totem/protocol';

type Props = {
  value: string;
  onChange: (raw: string) => void;
  label: string;
  describedBy?: string;
};

export function CodeBoxes({ value, onChange, label, describedBy }: Props): JSX.Element {
  const [focused, setFocused] = useState(false);
  const caret = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className={`code-boxes${focused ? ' focused' : ''}`}>
      <input
        className="code-boxes-input"
        value={value}
        maxLength={CODE_LENGTH}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        aria-label={label}
        aria-describedby={describedBy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const ch = value[i];
        const cls = [
          'code-box',
          ch ? 'filled' : '',
          focused && i === caret && value.length < CODE_LENGTH ? 'caret' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <span key={i} className={cls} aria-hidden="true">
            {ch ?? ''}
          </span>
        );
      })}
    </div>
  );
}
