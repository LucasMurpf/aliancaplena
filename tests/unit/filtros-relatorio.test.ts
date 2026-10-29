import { describe, expect, it } from "vitest";
import { lerFiltrosRelatorio, queryRelatorio } from "@/lib/filtros-relatorio";

const HOJE = new Date(Date.UTC(2026, 9, 28)); // 28/10/2026

describe("lerFiltrosRelatorio", () => {
  it("sem parâmetros: mês atual inteiro", () => {
    expect(lerFiltrosRelatorio({}, "geral", HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-31", incluirPrevistos: false });
  });
  it("fevereiro bissexto e dezembro", () => {
    expect(lerFiltrosRelatorio({}, "geral", new Date(Date.UTC(2028, 1, 10))).ate).toBe("2028-02-29");
    expect(lerFiltrosRelatorio({}, "geral", new Date(Date.UTC(2026, 11, 10))).ate).toBe("2026-12-31");
  });
  it("datas inválidas voltam ao padrão, cada uma por si", () => {
    const f = lerFiltrosRelatorio({ de: "31/10/2026", ate: "2026-02-30" }, "geral", HOJE);
    expect(f).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(lerFiltrosRelatorio({ de: "2026-01-05", ate: "x" }, "geral", HOJE)).toMatchObject({ de: "2026-01-05", ate: "2026-10-31" });
  });
  it("lê período, conta e categoria; ids vazios são descartados", () => {
    expect(lerFiltrosRelatorio({ de: "2026-01-01", ate: "2026-03-31", contaId: "c1", categoriaId: " " }, "despesas", HOJE)).toEqual({
      de: "2026-01-01",
      ate: "2026-03-31",
      contaId: "c1",
      incluirPrevistos: false,
    });
  });
  it("incluirPrevistos só com '1' e só no geral", () => {
    expect(lerFiltrosRelatorio({ incluirPrevistos: "1" }, "geral", HOJE).incluirPrevistos).toBe(true);
    expect(lerFiltrosRelatorio({ incluirPrevistos: "true" }, "geral", HOJE).incluirPrevistos).toBe(false);
    expect(lerFiltrosRelatorio({ incluirPrevistos: "1" }, "despesas", HOJE).incluirPrevistos).toBe(false);
  });
  it("membroId só em contribuições; usa o primeiro valor se repetido", () => {
    expect(lerFiltrosRelatorio({ membroId: "m1" }, "contribuicoes", HOJE).membroId).toBe("m1");
    expect(lerFiltrosRelatorio({ membroId: ["m2", "m3"] }, "contribuicoes", HOJE).membroId).toBe("m2");
    expect(lerFiltrosRelatorio({ membroId: "m1" }, "geral", HOJE).membroId).toBeUndefined();
  });
});

describe("queryRelatorio", () => {
  it("monta a query com o que está preenchido", () => {
    const f = lerFiltrosRelatorio({ contaId: "c1", incluirPrevistos: "1" }, "geral", HOJE);
    expect(queryRelatorio(f)).toBe("de=2026-10-01&ate=2026-10-31&contaId=c1&incluirPrevistos=1");
  });
  it("omite o que não foi escolhido", () => {
    expect(queryRelatorio(lerFiltrosRelatorio({}, "geral", HOJE))).toBe("de=2026-10-01&ate=2026-10-31");
  });
});
