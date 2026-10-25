import { describe, expect, test } from "vitest";
import { exigirBancoDeTeste, nomeDoBanco } from "../helpers/guarda-banco";
import { aplicarMigracoes } from "../helpers/migracoes";

describe("nomeDoBanco", () => {
  test("lê o nome do banco da URL", () => {
    expect(nomeDoBanco("postgresql://u:p@localhost:5432/igreja_test")).toBe("igreja_test");
    expect(nomeDoBanco("postgresql://u:p@ep-x-pooler.neon.tech/neondb?sslmode=require")).toBe("neondb");
    expect(nomeDoBanco("postgresql://u:p@host/")).toBe("");
    expect(nomeDoBanco("isto não é url")).toBe("");
  });
});

describe("exigirBancoDeTeste", () => {
  const app = "postgresql://u:p@localhost:5432/igreja";

  test("aceita banco com 'test' no nome, diferente do app", () => {
    const url = "postgresql://u:p@localhost:5432/igreja_test";
    expect(exigirBancoDeTeste(url, app)).toBe(url);
    expect(exigirBancoDeTeste("postgresql://u:p@h/TESTES?sslmode=require", app)).toBeTruthy();
  });

  test("recusa ausente ou igual ao do app", () => {
    expect(() => exigirBancoDeTeste(undefined, app)).toThrow("DATABASE_URL_TEST não definida");
    expect(() => exigirBancoDeTeste("", app)).toThrow("DATABASE_URL_TEST não definida");
    expect(() => exigirBancoDeTeste(app, app)).toThrow("igual a DATABASE_URL");
  });

  test("recusa URL diferente que aponta para banco sem 'test' (ex.: URL pooled da produção)", () => {
    const pooled = "postgresql://u:p@ep-x-pooler.neon.tech/neondb?sslmode=require";
    const direta = "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require";
    expect(() => exigirBancoDeTeste(pooled, direta)).toThrow('não tem "test" no nome');
    expect(() => exigirBancoDeTeste("postgresql://u:p@localhost:5432/igreja?schema=test", app)).toThrow();
    // "test" só no host ou na senha não conta.
    expect(() => exigirBancoDeTeste("postgresql://test:test@test.host/igreja", app)).toThrow('não tem "test" no nome');
  });

  test("aplicarMigracoes recusa banco sem 'test' antes de conectar", async () => {
    await expect(aplicarMigracoes("postgresql://u:p@127.0.0.1:1/igreja")).rejects.toThrow('não tem "test" no nome');
  });
});
