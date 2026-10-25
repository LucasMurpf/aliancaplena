import { expect, test } from "@playwright/test";
import { ADMIN } from "./dados";

const MIN = 60 * 1000;

test("aviso aos 14 min, Continuar renova e, sem interação, volta ao login", async ({ page }) => {
  await page.clock.install({ time: new Date() });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill(ADMIN.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entradas", exact: true })).toBeVisible();

  const aviso = page.getByRole("alertdialog", { name: /Sua sessão vai expirar/ });
  await expect(aviso).toBeHidden();

  await page.clock.runFor(14 * MIN + 2000);
  await expect(aviso).toBeVisible();

  await aviso.getByRole("button", { name: "Continuar" }).click();
  await expect(aviso).toBeHidden();

  // Sem interação: 15 min passam do último "Continuar" e o cliente derruba a sessão.
  await page.clock.runFor(15 * MIN);
  await expect(page).toHaveURL(/\/login\?expirou=1/);
  await expect(page.getByText("Sua sessão expirou por inatividade")).toBeVisible();
});
