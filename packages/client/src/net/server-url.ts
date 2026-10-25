/** Puerto por defecto del servidor Colyseus (packages/server). */
const DEFAULT_SERVER_PORT = 2567;

/**
 * URL del servidor de juego. En despliegue manda `VITE_WSS_URL`; sin ella se usa
 * el host desde el que se abrió la página, así el cliente también funciona desde
 * otro dispositivo de la red local (con `localhost` fijo conectaría a sí mismo).
 */
export function resolveServerUrl(
  envUrl: string | undefined,
  hostname: string,
  protocol: string,
): string {
  if (envUrl) return envUrl;
  const scheme = protocol === 'https:' ? 'wss' : 'ws';
  const host = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `${scheme}://${host}:${DEFAULT_SERVER_PORT}`;
}
