import { expect, test, type Page } from "@playwright/test";
import { ADMIN, DESCRICAO_SAIDA_DETALHADA, MEMBRO_NOMINAL } from "./dados";
import { entrar } from "./entrar";

/** Abre a prévia do mês atual, publica (com confirmação) e devolve o link público mostrado na tela. */
async function publicar(page: Page): Promise<string> {
  await page.goto("/relatorios/prestacao");
  await page.getByRole("button", { name: "Ver prévia" }).click();
  await expect(page).toHaveURL(/\/relatorios\/prestacao\/\d{4}\/\d{1,2}$/);

  await page.getByRole("button", { name: /^Publicar( nova versão)?$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();

  const link = page.getByTestId("link-publicado");
  await expect(link).toContainText("/p/");
  const url = (await link.textContent())?.trim() ?? "";
  expect(url).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/);
  return url;
}

test("publica a prestação, confere o link anônimo, versões e retirada", async ({ page, browser, baseURL }) => {
  await entrar(page, ADMIN.email, ADMIN.senha);

  const v1 = await publicar(page);
  const anonimo = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  try {
    const publica = await anonimo.newPage();

    // Link público, sem cookie: totais, faixa de parcial e nenhum nome de membro.
    await publica.goto(v1);
    await expect(publica.getByRole("heading", { name: "Prestação de contas" })).toBeVisible();
    await expect(publica.getByText(/Prestação parcial/)).toBeVisible();
    await expect(publica.getByText("Entradas por categoria")).toBeVisible();
    await expect(publica.getByText("Saídas por categoria")).toBeVisible();
    await expect(publica.getByText(DESCRICAO_SAIDA_DETALHADA)).toBeVisible(); // Luz detalha por categoria
    await expect(publica.getByText("Entradas", { exact: true })).toBeVisible();
    const texto = (await publica.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("zélia");
    expect(texto).not.toContain(MEMBRO_NOMINAL.toLowerCase());
    await expect(publica.getByText(/Existe uma versão mais recente/)).toHaveCount(0);

    // Nova versão: o link antigo avisa.
    const v2 = await publicar(page);
    expect(v2).not.toBe(v1);
    await publica.goto(v1);
    await expect(publica.getByText(/Existe uma versão mais recente/)).toBeVisible();
    await publica.goto(v2);
    await expect(publica.getByText(/Existe uma versão mais recente/)).toHaveCount(0);

    // Retirar a v2 pela lista.
    await page.goto("/relatorios/prestacao");
    const token2 = v2.split("/p/")[1];
    await page.getByRole("row").filter({ hasText: "v2" }).getByRole("button", { name: "Retirar" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Motivo da retirada").fill("Conferência E2E");
    await modal.getByRole("button", { name: "Retirar", exact: true }).click();
    await expect(page.getByRole("table").getByText(/Retirada em/)).toBeVisible();

    await publica.goto(`/p/${token2}`);
    await expect(publica.getByRole("heading", { name: "Esta prestação foi retirada pela igreja" })).toBeVisible();

    // Token aleatório de 43 caracteres: não encontrado.
    const aleatorio = "A".repeat(43);
    await publica.goto(`/p/${aleatorio}`);
    await expect(publica.getByText("This page could not be found.")).toBeVisible();
    await expect(publica.getByText("Entradas por categoria")).toHaveCount(0);
  } finally {
    await anonimo.close();
  }
});
