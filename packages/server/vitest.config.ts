import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 60000,
    // Colyseus abre sockets y usa el IPC del proceso: los hilos evitan
    // que el pool `forks` de vitest se coma mensajes que no son suyos.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
});
