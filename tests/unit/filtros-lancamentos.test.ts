import { describe, expect, it } from "vitest";
import { filtrosParaQuery, nomesFiltrosAtivos, parseFiltros } from "@/lib/filtros-lancamentos";

describe("parseFiltros", () => {
  it("lê os parâmetros da URL", () => {
    expect(
      parseFiltros({
        de: "2026-03-01",
        ate: "2026-03-31",
        tipo: "ENTRADA",
        categoria: "c1",
        conta: "k1",
        status: "PREVISTO",
        membro: "m1",
        busca: " luz ",
        pagina: "3",
      }),
    ).toEqual({
      de: "2026-03-01",
      ate: "2026-03-31",
      tipo: "ENTRADA",
      categoriaId: "c1",
      contaId: "k1",
      status: "PREVISTO",
      membroId: "m1",
      busca: "luz",
      pagina: 3,
    });
  });

  it("descarta valores inválidos em vez de falhar", () => {
    expect(parseFiltros({ de: "ontem", ate: "2026-02-31", tipo: "XX", status: "Y", pagina: "0" })).toEqual({ pagina: 1 });
    expect(parseFiltros({ pagina: "abc" })).toEqual({ pagina: 1 });
    expect(parseFiltros({ pagina: "2.5" })).toEqual({ pagina: 1 });
  });

  it("usa o primeiro valor quando o parâmetro se repete e ignora vazios", () => {
    expect(parseFiltros({ tipo: ["SAIDA", "ENTRADA"], conta: "", busca: "  " })).toEqual({ tipo: "SAIDA", pagina: 1 });
  });
});

describe("filtrosParaQuery", () => {
  it("monta a query só com o que foi preenchido, sem pagina 1", () => {
    expect(filtrosParaQuery({ tipo: "ENTRADA", categoriaId: "c1", pagina: 1 })).toBe("tipo=ENTRADA&categoria=c1");
    expect(filtrosParaQuery({})).toBe("");
  });

  it("inclui a página quando maior que 1 e codifica a busca", () => {
    expect(filtrosParaQuery({ busca: "água e luz", pagina: 2 })).toBe("busca=%C3%A1gua+e+luz&pagina=2");
  });

  it("é inverso de parseFiltros", () => {
    const f = { de: "2026-03-01", ate: "2026-03-31", status: "REALIZADO" as const, membroId: "m1", pagina: 4 };
    expect(parseFiltros(Object.fromEntries(new URLSearchParams(filtrosParaQuery(f))))).toEqual(f);
  });
});

describe("nomesFiltrosAtivos", () => {
  it("devolve só nomes, nunca valores, com período unificado", () => {
    expect(nomesFiltrosAtivos({ de: "2026-03-01", ate: "2026-03-31", categoriaId: "c1", busca: "x", pagina: 5 })).toEqual([
      "periodo",
      "categoria",
      "busca",
    ]);
    expect(nomesFiltrosAtivos({ ate: "2026-03-31" })).toEqual(["periodo"]);
    expect(nomesFiltrosAtivos({ pagina: 2 })).toEqual([]);
  });
});
