/**
 * Copiar al portapapeles con respaldo: la API asíncrona puede no existir (HTTP,
 * WebView) o rechazar (permisos). Devuelve si se copió de verdad.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clip = globalThis.navigator?.clipboard;
    if (clip?.writeText) {
      await clip.writeText(text);
      return true;
    }
  } catch {
    // rechazado: probamos el método clásico
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  area.select();
  try {
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Deja seleccionado el texto de un elemento para que el usuario lo copie a mano. */
export function selectContents(el: Element | null): void {
  const sel = globalThis.getSelection?.();
  if (!el || !sel || !globalThis.document) return;
  const range = globalThis.document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}
