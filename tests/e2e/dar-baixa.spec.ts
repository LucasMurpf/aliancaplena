import { expect, test } from "@playwright/test";
import { ADMIN, DESCRICAO_PREVISTO } from "./dados";
import { entrar } from "./entrar";

test("dar baixa em um lançamento previsto muda o status e registra no histórico", async ({ page }) => {
  await entrar(page, ADMIN.email, ADMIN.senha);

  await page.goto("/lancamentos");
  await page.getByRole("link", { name: new RegExp(DESCRICAO_PREVISTO) }).first().click();
  await expect(page.getByRole("heading", { name: "Lançamento", exact: true })).toBeVisible();
  const dados = page.getByRole("region", { name: "Dados do lançamento" });
  await expect(dados.getByText("Previsto", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Dar baixa" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Dar baixa" }).click();

  await expect(dados.getByText("Realizado", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByRole("cell", { name: "Deu baixa", exact: true })).toBeVisible();
});
