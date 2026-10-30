/** Errores de regla compartidos por engine.ts y effects.ts. `null` = sin error. */
export type Fail = { code: string; msg?: string } | null;

export const ERR = (code: string, msg?: string): Fail =>
  msg === undefined ? { code } : { code, msg };
