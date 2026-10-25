import { expect, test } from "@playwright/test";
import { ADMIN } from "./dados";

test("credencial errada mostra erro; credencial certa leva ao dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha inválidos")).toBeVisible();

  await page.getByLabel("Senha").fill(ADMIN.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Entradas", exact: true })).toBeVisible();
});

test("respostas trazem os cabeçalhos de segurança", async ({ request }) => {
  const r = await request.get("/login");
  expect(r.status()).toBe(200);
  const h = r.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(h["referrer-policy"]).toBe("same-origin");
  expect(h["x-content-type-options"]).toBe("nosniff");
});
