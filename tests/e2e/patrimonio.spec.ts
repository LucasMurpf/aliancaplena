import { expect, test } from "@playwright/test";
import { RESP_PATRIMONIO } from "./dados";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test("no celular: responsável cai no patrimônio, cadastra e edita um bem", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(RESP_PATRIMONIO.email);
  await page.getByLabel("Senha").fill(RESP_PATRIMONIO.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/patrimonio$/);
  await expect(page.getByText("Nenhum bem cadastrado")).toBeVisible();

  await page.getByRole("link", { name: "Novo bem" }).click();
  await page.getByRole("button", { name: "Cadastrar bem" }).click();
  await expect(page.getByText("Informe a descrição")).toBeVisible();

  await page.getByLabel("Descrição").fill("Caixa de som");
  await page.getByLabel("Valor").fill("1.200,50");
  await page.getByLabel("Local").fill("Templo");
  await page.getByRole("button", { name: "Cadastrar bem" }).click();
  await expect(page).toHaveURL(/\/patrimonio\/[^/]+\?salvo=1/);
  await expect(page.getByText("Bem cadastrado", { exact: true })).toBeVisible();

  await page.getByLabel("Local").fill("Salão");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByText("Salão").first()).toBeVisible();

  await page.getByRole("link", { name: "Voltar para o patrimônio" }).click();
  const linha = page.getByRole("link", { name: /Caixa de som/ }).first();
  await expect(linha).toContainText("Salão");
  await expect(page.getByText(/1 bem · R\$ 1\.200,50/)).toBeVisible();

  // Sem acesso ao financeiro.
  await page.goto("/lancamentos");
  await expect(page).toHaveURL(/\/em-breve$/);
});
