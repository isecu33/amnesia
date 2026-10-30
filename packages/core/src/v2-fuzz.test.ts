/** Fuzz reducido con todas las reglas v2 activas: I1, I2, I3 e I8 siguen en pie. */
import { describe, expect, it } from 'vitest';
import { viewFor } from './view.js';
import { newGame, playRandomGame, Rnd, scrambleHidden, totalCards } from './test-helpers.js';

describe('reglas v2 · fuzz con Salvaje, Presagios y Kamikaze', () => {
  it('40 partidas terminan sin violar I1, I2 ni I8', () => {
    for (let seed = 0; seed < 40; seed++) {
      const ids = ['A', 'B', 'C', 'D'].slice(0, 2 + (seed % 3));
      const s0 = newGame(
        {
          mode: seed % 2 === 0 ? 'quick' : 'classic',
          gameEndScore: 50,
          wildModeEnabled: true,
          omensEnabled: true,
          kamikazeRule: true,
          kamikazeResetScore: 25,
        },
        ids,
        seed,
      );
      const { state, steps } = playRandomGame(s0, new Rnd(seed + 1), 3000);
      expect(state.phase, `semilla ${seed}`).toBe('GAME_END');
      for (const st of steps) {
        expect(totalCards(st.after)).toBe(52);
        for (const p of st.after.players) {
          expect(p.slots.length).toBeLessThanOrEqual(st.after.config.maxSlots);
          // I2: lo oculto no cambia la vista
          const a = JSON.stringify(viewFor(st.after, p.id));
          const b = JSON.stringify(viewFor(scrambleHidden(st.after, p.id, new Rnd(7)), p.id));
          expect(a).toBe(b);
        }
      }
    }
  });
});
