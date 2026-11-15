// Capturas del rig tal como se ve en el navegador (three.js, página rig-preview del cliente).
// Uso (con el cliente en marcha: corepack pnpm --filter @totem/client dev):
//   node tools/rig/rig_browser_shots.mjs <animal> <dir_salida> [variante] [url_base]
// variante: carga assets/<animal>/<animal>-rig.<variante>.glb (sin ella, el asset actual).
// Genera <clip>_t<seg>_<vista>[_huesos].png y una hoja de contactos por clip (hoja_<clip>.png).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(resolve('packages/client/package.json'));
const { chromium } = require('@playwright/test');

const [animal, out, variant, base = 'http://localhost:5173'] = process.argv.slice(2);
if (!animal || !out) {
  console.error('uso: node tools/rig/rig_browser_shots.mjs <animal> <dir_salida> [variante] [url_base]');
  process.exit(2);
}
// Segundos a capturar: inicio, anticipación, alcance, agarre, sostener, soltar, final (30 fps).
const SHOTS = {
  reposo: [0, 1.2],
  coger_carta: [0, 0.3, 0.55, 0.8, 1.1, 1.5, 2.0, 3.1, 3.5],
  mirar_izq: [0.4, 1.0],
  mirar_der: [0.4, 1.0],
};
const VIEWS = ['frente', 'lado', '34'];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

for (const [clip, times] of Object.entries(SHOTS)) {
  for (const t of times) {
    for (const view of VIEWS) {
      for (const bones of [false, true]) {
        if (bones && view === '34') continue;
        const q = new URLSearchParams({ animal, clip, t: String(t), view, bones: bones ? '1' : '0' });
        if (variant) q.set('v', variant);
        await page.goto(`${base}/rig-preview.html?${q}`);
        await page.waitForSelector('body[data-ready="1"]', { timeout: 240_000 });   // GLB de ~25 MB con la máquina cargada
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(out, `${clip}_t${t}_${view}${bones ? '_huesos' : ''}.png`) });
      }
    }
  }
}
await browser.close();
console.log(errors.length ? `ERRORES en la página:\n${errors.join('\n')}` : 'sin errores de consola');
