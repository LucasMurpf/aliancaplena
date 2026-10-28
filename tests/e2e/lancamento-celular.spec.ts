import { expect, test } from "@playwright/test";
import { MEMBRO, TESOUREIRO } from "./dados";
import { entrar } from "./entrar";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test("no celular: lança um dízimo e vê o valor em Entradas no Início", async ({ page }) => {
  await entrar(page, TESOUREIRO.email, TESOUREIRO.senha);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: /Lançamentos/ }).click();
  await expect(page).toHaveURL(/\/lancamentos$/);

  await page.getByRole("link", { name: "Novo lançamento" }).click();
  await expect(page).toHaveURL(/\/lancamentos\/novo/);

  await page.getByRole("radio", { name: "Entrada" }).click();
  await page.locator("#valor").fill("1.234,56");
  await page.locator("#categoria").selectOption({ label: "Dízimo" });

  await page.locator("#membro").fill("Maria");
  await page.getByRole("button", { name: MEMBRO }).click();

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Lançamento salvo")).toBeVisible();
  await expect(page).toHaveURL(/\/lancamentos\/[^/]+\?salvo=1/);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: /Início/ }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("region", { name: "Entradas", exact: true })).toContainText(/R\$\s*1\.334,56/); // 1.234,56 lançado aqui + R$ 100,00 do dízimo da semente
});
