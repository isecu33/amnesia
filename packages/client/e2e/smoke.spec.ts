import { expect, test } from '@playwright/test';

/**
 * Smoke de WP-16: crear sala, 2 pestañas, jugar turnos scriptados y aserciones
 * sobre la vista. Corre contra staging (E2E_BASE_URL) o contra `pnpm dev`.
 */
test('dos pestañas crean sala, entran por código y llegan a la mesa', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();

  await host.goto('/');
  await host.getByRole('textbox').first().fill('Ana');
  await host.getByRole('button', { name: /Crear sala|Create room/ }).click();

  const code = await host.locator('code.code').innerText();
  expect(code).toHaveLength(5);

  await guest.goto('/');
  const guestInputs = guest.getByRole('textbox');
  await guestInputs.nth(0).fill('Bea');
  await guestInputs.nth(1).fill(code);
  await guest.getByRole('button', { name: /^(Unirse|Join)$/ }).click();

  await expect(host.locator('.seats li')).toHaveCount(2, { timeout: 15_000 });

  // El anfitrión añade un bot, acorta el vislumbre y arranca.
  await host.getByRole('button', { name: /bot listo|smart bot/ }).click();
  await host.getByRole('button', { name: /Empezar partida|Start game/ }).click();

  // Ambos acaban en la mesa 3D con su canvas.
  await expect(host.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('canvas')).toBeVisible({ timeout: 20_000 });

  // El HUD muestra el marcador con los tres asientos.
  await expect(host.locator('.scoreboard .plate')).toHaveCount(3, { timeout: 20_000 });
});

test('el tutorial se completa sin servidor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tutorial/ }).click();
  await expect(page.locator('.tutorial .banner')).toContainText(/1\/6/);
  await page.locator('.slots.big button').nth(0).click();
  await page.locator('.slots.big button').nth(1).click();
  await page.getByRole('button', { name: /Ver estos|Peek at/ }).click();
  await expect(page.locator('.tutorial .banner')).toContainText(/2\/6/);
});

test('la escena de depuración de VFX dispara las secuencias', async ({ page }) => {
  await page.goto('/?scene=vfx');
  await expect(page.locator('canvas')).toBeVisible();
  const buttons = page.locator('.vfx-debug .row button');
  await expect(buttons).toHaveCount(10);
  await buttons.first().click();
});
