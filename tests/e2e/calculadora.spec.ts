import { expect, test } from "@playwright/test";
import { TESOUREIRO } from "./dados";
import { entrar } from "./entrar";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test("no celular: conta o culto com divergência, exige observação e registra", async ({ page }) => {
  await entrar(page, TESOUREIRO.email, TESOUREIRO.senha);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: /Calculadora/ }).click();
  await expect(page).toHaveURL(/\/calculadora$/);
  await page.getByRole("link", { name: /Nova contagem/ }).first().click();
  await expect(page).toHaveURL(/\/calculadora\/nova/);

  await page.getByRole("radio", { name: "Conferir culto" }).click();
  await expect(page.locator("#conta")).toContainText("Caixa");

  // R$ 2,00 contados contra o dízimo de hoje da semente: sempre falta dinheiro.
  await page.getByLabel("R$ 2,00", { exact: true }).fill("1");
  await expect(page.getByText(/Faltam R\$/)).toBeVisible();

  const registrar = page.getByRole("button", { name: "Registrar contagem" });
  await expect(registrar).toBeEnabled();
  await registrar.click();
  await expect(page.getByText("Explique a diferença na observação")).toBeVisible();
  await expect(page).toHaveURL(/\/calculadora\/nova/);

  await page.getByLabel(/Observação/).fill("Dízimo de um envelope ainda não contado");
  await registrar.click();

  await expect(page).toHaveURL(/\/calculadora\/[^/]+\?salvo=1/);
  await expect(page.getByText("Contagem registrada")).toBeVisible();
  await expect(page.getByRole("region", { name: "Resultado da contagem" })).toContainText("Dízimo de um envelope");

  await page.goto("/calculadora");
  await expect(page.getByRole("link", { name: /Faltam/ }).first()).toBeVisible();
});
