import { createServer } from 'node:net';

/** Pide un puerto libre al SO (puerto 0) y lo libera; para que los tests no choquen entre procesos. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close(() => reject(new Error('freePort: dirección inesperada')));
        return;
      }
      srv.close((err) => (err ? reject(err) : resolve(addr.port)));
    });
  });
}
