/**
 * Nombres de bot localizados sin tocar el protocolo: el servidor los bautiza
 * «Bot listo N» / «Bot torpe N» (session.ts, formato estable) y el cliente los
 * traduce. Un humano que se llame así no se toca: solo se aplica a asientos bot.
 */
import { DICTS, fmt, type Lang } from '../../i18n/index.js';

const SERVER_BOT_NAME = /^Bot (listo|torpe) (\d+)$/;

export function displaySeatName(
  seat: { name: string; controller: 'human' | 'bot' },
  lang: Lang,
): string {
  if (seat.controller !== 'bot') return seat.name;
  const m = SERVER_BOT_NAME.exec(seat.name);
  if (!m) return seat.name;
  const key = m[1] === 'listo' ? 'botNameGreedy' : 'botNameRandom';
  return fmt(DICTS[lang][key], { n: m[2] ?? '' });
}
