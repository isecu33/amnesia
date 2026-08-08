import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Three.js y GSAP cambian poco: chunk aparte para que cacheen bien.
        manualChunks: {
          three: ['three'],
          anim: ['gsap'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
