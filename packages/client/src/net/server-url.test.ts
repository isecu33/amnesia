import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from './server-url.js';

describe('URL del servidor de juego', () => {
  it('usa VITE_WSS_URL cuando está definida (despliegue)', () => {
    expect(resolveServerUrl('wss://totem.example.com', 'localhost', 'http:')).toBe(
      'wss://totem.example.com',
    );
  });

  it('en local usa el mismo host desde el que se abrió la página', () => {
    expect(resolveServerUrl(undefined, 'localhost', 'http:')).toBe('ws://localhost:2567');
  });

  it('desde otro dispositivo de la red apunta a la IP del PC, no a su propio localhost', () => {
    expect(resolveServerUrl(undefined, '192.168.1.172', 'http:')).toBe('ws://192.168.1.172:2567');
  });

  it('una variable vacía cuenta como no definida', () => {
    expect(resolveServerUrl('', '192.168.1.172', 'http:')).toBe('ws://192.168.1.172:2567');
  });

  it('en páginas https usa wss para no bloquear la conexión', () => {
    expect(resolveServerUrl(undefined, 'juego.example.com', 'https:')).toBe(
      'wss://juego.example.com:2567',
    );
  });

  it('un host IPv6 va entre corchetes', () => {
    expect(resolveServerUrl(undefined, '::1', 'http:')).toBe('ws://[::1]:2567');
  });
});
