import { describe, expect, it } from "vitest";
import { TODAS_PERMISSOES, permissoesDe, pode } from "@/lib/permissoes";

describe("permissões", () => {
  it("Pastor vê o financeiro mas não lança", () => {
    expect(pode(["PASTOR"], "financeiro.ver")).toBe(true);
    expect(pode(["PASTOR"], "financeiro.lancar")).toBe(false);
  });

  it("Pastor + Tesoureiro tem ambas (união)", () => {
    const papeis = ["PASTOR", "TESOUREIRO"] as const;
    expect(pode([...papeis], "financeiro.ver")).toBe(true);
    expect(pode([...papeis], "financeiro.lancar")).toBe(true);
  });

  it("Tesoureiro + Patrimônio soma as permissões do patrimônio", () => {
    expect([...permissoesDe(["TESOUREIRO", "PATRIMONIO"])].sort()).toEqual(
      [...permissoesDe(["TESOUREIRO"]), "patrimonio.ver", "patrimonio.gerenciar"].sort(),
    );
  });

  it("Eventos sozinho não tem permissões na Fase 1", () => {
    expect(permissoesDe(["EVENTOS"]).size).toBe(0);
  });

  it("Patrimônio sozinho vê e gerencia bens, sem acesso ao financeiro", () => {
    expect([...permissoesDe(["PATRIMONIO"])].sort()).toEqual(["historico.ver", "patrimonio.gerenciar", "patrimonio.ver"]);
  });

  it("sem papéis, sem permissões", () => {
    expect(permissoesDe([]).size).toBe(0);
  });

  it("Admin tem todas as 9", () => {
    const p = permissoesDe(["ADMIN"]);
    expect(TODAS_PERMISSOES).toHaveLength(9);
    expect(p.size).toBe(9);
    for (const perm of TODAS_PERMISSOES) expect(p.has(perm)).toBe(true);
  });

  it("Tesoureiro não tem admin", () => {
    expect(pode(["TESOUREIRO"], "admin")).toBe(false);
  });

  it("Pastor: matriz da spec", () => {
    expect([...permissoesDe(["PASTOR"])].sort()).toEqual(
      ["financeiro.ver", "historico.ver", "membros.gerenciar", "membros.ver_nomes", "patrimonio.ver"].sort(),
    );
  });

  it("Tesoureiro: tudo menos admin e patrimônio", () => {
    expect([...permissoesDe(["TESOUREIRO"])].sort()).toEqual(
      TODAS_PERMISSOES.filter((p) => p !== "admin" && !p.startsWith("patrimonio.")).sort(),
    );
  });
});
