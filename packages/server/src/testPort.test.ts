import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { freePort } from './testPort.js';

describe('freePort', () => {
  it('devuelve un entero de puerto válido', async () => {
    const port = await freePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('el puerto queda libre para hacer listen', async () => {
    const port = await freePort();
    const srv = createServer();
    await new Promise<void>((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, resolve);
    });
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });
});
