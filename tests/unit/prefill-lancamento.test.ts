import { describe, expect, it } from "vitest";
import { lerPrefillLancamento } from "@/lib/prefill-lancamento";

const contas = [{ id: "c1" }, { id: "c2" }];
const hoje = "2026-10-28";

describe("lerPrefillLancamento", () => {
  it("aceita parâmetros válidos", () => {
    expect(
      lerPrefillLancamento(
        { tipo: "SAIDA", conta: "c2", data: "2026-10-25", valor: "1.234,56", descricao: "Ajuste da contagem de 25/10/2026" },
        { contas, hoje },
      ),
    ).toEqual({
      tipo: "SAIDA",
      contaId: "c2",
      data: "2026-10-25",
      valor: "1.234,56",
      descricao: "Ajuste da contagem de 25/10/2026",
    });
  });
  it("ignora silenciosamente o que for inválido", () => {
    expect(
      lerPrefillLancamento(
        { tipo: "XXX", conta: "inexistente", data: "2026-10-29", valor: "-5", descricao: "x".repeat(201) },
        { contas, hoje },
      ),
    ).toEqual({});
    expect(lerPrefillLancamento({ data: "2026-02-30", valor: "abc" }, { contas, hoje })).toEqual({});
    expect(lerPrefillLancamento({ valor: "0,00" }, { contas, hoje })).toEqual({});
  });
  it("aceita hoje e usa o primeiro valor de parâmetros repetidos", () => {
    expect(lerPrefillLancamento({ data: ["2026-10-28", "2020-01-01"], tipo: ["ENTRADA"] }, { contas, hoje })).toEqual({
      data: "2026-10-28",
      tipo: "ENTRADA",
    });
  });
  it("descrição: apara os espaços e ignora a que fica vazia", () => {
    expect(lerPrefillLancamento({ descricao: "  Ajuste  " }, { contas, hoje })).toEqual({ descricao: "Ajuste" });
    expect(lerPrefillLancamento({ descricao: "   " }, { contas, hoje })).toEqual({});
  });
  it("sem parâmetros devolve vazio", () => {
    expect(lerPrefillLancamento({}, { contas, hoje })).toEqual({});
  });
});
