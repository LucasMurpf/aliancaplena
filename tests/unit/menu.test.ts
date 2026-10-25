import { describe, expect, it } from "vitest";
import { itensDoMenu } from "@/lib/menu";

const rotulos = (p: Parameters<typeof itensDoMenu>[0]) => itensDoMenu(p).map((i) => i.rotulo);

describe("itensDoMenu", () => {
  it("Pastor não vê Contas, Categorias nem Usuários", () => {
    const r = rotulos(["PASTOR"]);
    expect(r).toEqual(["Início", "Lançamentos", "Membros"]);
  });
  it("Tesoureiro vê Contas e Categorias, não Usuários", () => {
    const r = rotulos(["TESOUREIRO"]);
    expect(r).toContain("Contas");
    expect(r).toContain("Categorias");
    expect(r).not.toContain("Usuários");
    expect(r).not.toContain("Dados da igreja");
  });
  it("Admin vê tudo", () => {
    expect(rotulos(["ADMIN"])).toEqual([
      "Início", "Lançamentos", "Membros", "Contas", "Categorias", "Usuários", "Dados da igreja",
    ]);
  });
  it("Eventos vê só Início apontando para /em-breve", () => {
    expect(itensDoMenu(["EVENTOS"])).toEqual([{ rotulo: "Início", href: "/em-breve", icone: "🏠" }]);
  });
  it("sem papéis: só /em-breve", () => {
    expect(itensDoMenu([]).map((i) => i.href)).toEqual(["/em-breve"]);
  });
  it("Início do financeiro aponta para /", () => {
    expect(itensDoMenu(["TESOUREIRO"])[0]).toMatchObject({ rotulo: "Início", href: "/" });
  });
});
