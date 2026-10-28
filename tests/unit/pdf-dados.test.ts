import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { relatorioParaPdf, nomeArquivoRelatorio, geradoEm } from "@/lib/pdf/dados";

const D = (v: string) => new Prisma.Decimal(v);
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const cab = { rotuloPeriodo: "01/10/2026 a 31/10/2026", de: dia("2026-10-01"), ate: dia("2026-10-31"), conta: null, categoria: null };

describe("relatorioParaPdf", () => {
  it("geral: formata dinheiro/datas e vira só texto; avisa previstos no cabeçalho", () => {
    const r = relatorioParaPdf(
      "geral",
      {
        ...cab,
        conta: "Caixa",
        linhas: [
          { data: dia("2026-10-05"), tipo: "ENTRADA", categoria: "Dízimo", conta: "Caixa", descricao: null, valor: D("1234.5"), previsto: false },
          { data: dia("2026-10-20"), tipo: "SAIDA", categoria: "Luz", conta: "Caixa", descricao: "Conta de luz", valor: D("80"), previsto: true },
        ],
        totalEntradas: D("1234.5"),
        totalSaidas: D("80"),
        resultado: D("1154.5"),
      },
      { incluirPrevistos: true },
    );
    expect(r.titulo).toBe("Relatório geral");
    expect(r.periodo).toBe("01/10/2026 a 31/10/2026");
    expect(r.filtros).toEqual(["Conta: Caixa", "Inclui lançamentos previstos"]);
    expect(r.resumo).toEqual([
      { rotulo: "Entradas", valor: "R$ 1.234,50" },
      { rotulo: "Saídas", valor: "R$ 80,00" },
      { rotulo: "Resultado", valor: "R$ 1.154,50" },
    ]);
    const t = r.tabelas[0];
    expect(t.colunas.map((c) => c.titulo)).toEqual(["Data", "Tipo", "Categoria", "Conta", "Descrição", "Situação", "Valor"]);
    expect(t.linhas[0]).toEqual(["05/10/2026", "Entrada", "Dízimo", "Caixa", "", "Realizado", "R$ 1.234,50"]);
    expect(t.linhas[1][5]).toBe("Previsto");
    expect(JSON.stringify(r)).not.toContain("Decimal");
  });

  it("geral sem previstos: sem coluna Situação e sem aviso", () => {
    const r = relatorioParaPdf("geral", { ...cab, linhas: [], totalEntradas: D("0"), totalSaidas: D("0"), resultado: D("0") }, {});
    expect(r.filtros).toEqual([]);
    expect(r.tabelas[0].colunas.map((c) => c.titulo)).not.toContain("Situação");
  });

  it("arrecadação: percentual com vírgula e total no rodapé", () => {
    const r = relatorioParaPdf("arrecadacao", {
      ...cab,
      categorias: [{ categoria: "Dízimo", total: D("300"), percentual: D("75"), quantidade: 3 }, { categoria: "Oferta", total: D("100"), percentual: D("25"), quantidade: 1 }],
      total: D("400"),
    });
    expect(r.titulo).toBe("Arrecadação por categoria");
    expect(r.tabelas[0].linhas[0]).toEqual(["Dízimo", "3", "75,00%", "R$ 300,00"]);
    expect(r.tabelas[0].rodape).toEqual(["Total", "", "", "R$ 400,00"]);
  });

  it("despesas: uma tabela por categoria com subtotal", () => {
    const r = relatorioParaPdf("despesas", {
      ...cab,
      grupos: [{ categoria: "Luz", itens: [{ data: dia("2026-10-02"), descricao: "Out", conta: "Caixa", valor: D("50") }], subtotal: D("50") }],
      total: D("50"),
    });
    expect(r.tabelas).toHaveLength(1);
    expect(r.tabelas[0].titulo).toBe("Luz");
    expect(r.tabelas[0].linhas[0]).toEqual(["02/10/2026", "Out", "Caixa", "R$ 50,00"]);
    expect(r.tabelas[0].rodape).toEqual(["Subtotal", "", "", "R$ 50,00"]);
    expect(r.resumo).toEqual([{ rotulo: "Total de despesas", valor: "R$ 50,00" }]);
  });

  it("contribuições: modo membro e modo todos", () => {
    const m = relatorioParaPdf("contribuicoes", {
      ...cab,
      membro: "João",
      itens: [{ data: dia("2026-10-03"), categoria: "Dízimo", valor: D("10") }],
      total: D("10"),
    });
    expect(m.filtros).toEqual(["Membro: João"]);
    expect(m.tabelas[0].linhas[0]).toEqual(["03/10/2026", "Dízimo", "R$ 10,00"]);
    const t = relatorioParaPdf("contribuicoes", { ...cab, porMembro: [{ membroId: "x", membro: "Ana", quantidade: 2, total: D("20") }], total: D("20") });
    expect(t.tabelas[0].linhas[0]).toEqual(["Ana", "2", "R$ 20,00"]);
    expect(JSON.stringify(t)).not.toContain('"x"');
  });
});

describe("nomeArquivoRelatorio / geradoEm", () => {
  it("monta o nome com o período", () => {
    expect(nomeArquivoRelatorio("geral", "2026-10-01", "2026-10-31", "pdf")).toBe("relatorio-geral-2026-10-01_2026-10-31.pdf");
  });
  it("formata a hora no fuso de São Paulo", () => {
    expect(geradoEm(new Date("2026-10-27T15:05:00Z"))).toBe("27/10/2026 12:05");
  });
});
