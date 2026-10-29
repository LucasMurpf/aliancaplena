import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { MEMBRO_NOMINAL, TESOUREIRO } from "./dados";
import { entrar } from "./entrar";

test("gera o recibo do dízimo, baixa o PDF numerado e passa a oferecer o mesmo número", async ({ page }) => {
  await entrar(page, TESOUREIRO.email, TESOUREIRO.senha);

  await page.goto("/lancamentos");
  await page.getByRole("row").filter({ hasText: MEMBRO_NOMINAL }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Lançamento", exact: true })).toBeVisible();

  // O Chrome de mesa não tem compartilhamento de arquivos: cai no download.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^(Gerar recibo|Baixar recibo)/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^recibo-\d{4}-\d{6}\.pdf$/);
  const caminho = await download.path();
  const inicio = (await readFile(caminho)).subarray(0, 5).toString("latin1");
  expect(inicio).toBe("%PDF-");

  // Depois de emitido, o botão mostra o número (a página é atualizada sozinha).
  await page.reload();
  await expect(page.getByRole("button", { name: /^Baixar recibo \d{4}\/\d{6}$/ })).toBeVisible();
  await expect(page.getByText(/Recibo nº \d{4}\/\d{6} já emitido/)).toBeVisible();
});
