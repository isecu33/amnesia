/**
 * En móvil (puntero grueso) intenta pantalla completa + bloqueo horizontal tras un
 * gesto del usuario. Muchos navegadores lo niegan (iOS Safari): se ignora el fallo.
 */
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

export function tryImmersive(): void {
  try {
    if (!globalThis.matchMedia?.('(pointer: coarse)').matches) return;
    const root = globalThis.document?.documentElement;
    if (!root?.requestFullscreen || globalThis.document.fullscreenElement) return;
    root
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() =>
        (globalThis.screen?.orientation as LockableOrientation | undefined)?.lock?.('landscape'),
      )
      .catch(() => undefined);
  } catch {
    // sin API de pantalla completa: se juega igual
  }
}
