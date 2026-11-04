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

test("no celular: Pix somam separado da espécie e não mudam a diferença", async ({ page }) => {
  await entrar(page, TESOUREIRO.email, TESOUREIRO.senha);
  await page.goto("/calculadora/nova");

  const barra = page.locator("dl").last();
  await page.getByLabel("R$ 2,00", { exact: true }).fill("1");
  await expect(page.getByText(/Faltam R\$/)).toBeVisible();
  const diferencaAntes = await page.getByText(/Faltam R\$/).innerText();

  await page.getByLabel("Pix 1", { exact: true }).fill("50,00");
  // Enter passa para o próximo Pix e não registra a contagem.
  await page.getByLabel("Pix 1", { exact: true }).press("Enter");
  await expect(page.getByLabel("Pix 2", { exact: true })).toBeFocused();
  await page.getByLabel("Pix 2", { exact: true }).fill("12,50");
  await page.getByRole("button", { name: "Adicionar outro Pix" }).click();
  await page.getByLabel("Pix 3", { exact: true }).fill("99,00");
  await page.getByRole("button", { name: "Remover Pix 3" }).click();

  await expect(barra).toContainText("R$ 2,00");
  await expect(barra).toContainText("R$ 62,50");
  await expect(barra).toContainText("R$ 64,50");
  await expect(page.getByText(/Faltam R\$/)).toHaveText(diferencaAntes);

  await page.getByLabel(/Observação/).fill("Teste com Pix");
  await page.getByRole("button", { name: "Registrar contagem" }).click();
  await expect(page).toHaveURL(/\/calculadora\/[^/]+\?salvo=1/);
  const resultado = page.getByRole("region", { name: "Resultado da contagem" });
  await expect(resultado).toContainText("R$ 62,50");
  await expect(page.getByRole("region", { name: "Pix" })).toContainText("R$ 12,50");
});
