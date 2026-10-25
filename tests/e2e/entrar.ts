import { expect, type Page } from "@playwright/test";

export async function entrar(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entradas", exact: true })).toBeVisible();
}
