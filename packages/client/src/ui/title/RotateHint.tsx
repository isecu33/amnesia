/** Aviso de girar el móvil: visible solo en vertical estrecho (CSS), en TODAS las pantallas. */
export function RotateHint({ text }: { text: string }): JSX.Element {
  return (
    <div className="rotate-prompt" role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="rotate-icon">
        <path d="M5 1h6v1h1v12h-1v1H5v-1H4V2h1zm0 2v9h6V3zm2 10v1h2v-1z" />
        <path d="M13 6h1v1h1v2h-1v1h-1V9h-1V7h1z" className="rotate-arrow" />
      </svg>
      <p>{text}</p>
    </div>
  );
}
