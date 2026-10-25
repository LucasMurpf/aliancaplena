import { describe, expect, test } from "vitest";
import { parseFiltros } from "@/lib/filtros-lancamentos";
import { PAGINA_MAXIMA, parsePagina } from "@/lib/paginacao";

describe("parsePagina", () => {
  test.each([
    ["1", 1],
    ["3", 3],
    [" 7 ", 7],
    [String(PAGINA_MAXIMA), PAGINA_MAXIMA],
    [42, 42],
  ])("aceita %j → %d", (v, esperado) => {
    expect(parsePagina(v)).toBe(esperado);
  });

  test.each([
    "0", "-1", "2.5", "abc", "", "  ", "Infinity", "-Infinity", "NaN", "1e21", "9007199254740993",
    String(PAGINA_MAXIMA + 1), undefined, null, Infinity, 1e21, Number.NaN, 2.5, ["2"],
  ])("valor inválido %j vira 1", (v) => {
    expect(parsePagina(v)).toBe(1);
  });

  test("lista de lançamentos usa a mesma regra", () => {
    expect(parseFiltros({ pagina: "1e21" })).toEqual({ pagina: 1 });
    expect(parseFiltros({ pagina: "Infinity" })).toEqual({ pagina: 1 });
    expect(parseFiltros({ pagina: "10001" })).toEqual({ pagina: 1 });
    expect(parseFiltros({ pagina: "10000" })).toEqual({ pagina: 10000 });
  });
});
