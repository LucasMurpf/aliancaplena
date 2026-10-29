import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { montarSnapshot, type DadosSnapshot } from "@/lib/prestacao/snapshot";

const d = (v: string) => new Prisma.Decimal(v);
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const base = (o: Partial<DadosSnapshot> = {}): DadosSnapshot => ({
  igreja: { nome: "Igreja Aliança", logoUrl: null },
  ano: 2026,
  mes: 9,
  dataCorte: dia("2026-09-30"),
  parcial: false,
  saldoFimMes: d("1234.5"),
  entradas: [
    { categoria: "Oferta", total: d("300") },
    { categoria: "Dízimo", total: d("1000.10") },
  ],
  saidas: [
    {
      categoria: "Luz",
      total: d("150"),
      detalharPublico: true,
      itens: [
        { data: dia("2026-09-20"), descricao: "Conta de setembro", valor: d("100") },
        { data: dia("2026-09-05"), descricao: "  ", valor: d("50") },
      ],
    },
    {
      categoria: "Ajuda social",
      total: d("80"),
      detalharPublico: false,
      itens: [{ data: dia("2026-09-10"), descricao: "Cesta para a família X", valor: d("80") }],
    },
  ],
  ...o,
});

describe("montarSnapshot", () => {
  it("formata resumo, totais e cabeçalho", () => {
    const s = montarSnapshot(base());
    expect(s.versaoSchema).toBe(1);
    expect(s.igreja).toEqual({ nome: "Igreja Aliança", logoUrl: null });
    expect(s.ano).toBe(2026);
    expect(s.mes).toBe(9);
    expect(s.parcial).toBe(false);
    expect(s.dataCorte).toBe("30/09/2026");
    expect(s.rotulo).toBe("Setembro de 2026");
    expect(s.resumo).toEqual({
      entradas: "R$ 1.300,10",
      saidas: "R$ 230,00",
      resultado: "R$ 1.070,10",
      saldoFimMes: "R$ 1.234,50",
    });
    // Maior total primeiro.
    expect(s.entradas).toEqual([
      { categoria: "Dízimo", total: "R$ 1.000,10" },
      { categoria: "Oferta", total: "R$ 300,00" },
    ]);
  });

  it("detalha só categorias com detalharPublico, em ordem de data, com '—' para descrição vazia", () => {
    const s = montarSnapshot(base());
    expect(s.saidas).toEqual([
      {
        categoria: "Luz",
        total: "R$ 150,00",
        itens: [
          { data: "05/09/2026", descricao: "—", valor: "R$ 50,00" },
          { data: "20/09/2026", descricao: "Conta de setembro", valor: "R$ 100,00" },
        ],
      },
      { categoria: "Ajuda social", total: "R$ 80,00" },
    ]);
    expect(JSON.stringify(s)).not.toContain("família X");
  });

  it("sem detalhes: nenhuma saída tem itens; resultado negativo", () => {
    const s = montarSnapshot(
      base({
        entradas: [],
        saidas: [{ categoria: "Aluguel", total: d("500"), detalharPublico: false, itens: [] }],
        saldoFimMes: d("-10"),
      }),
    );
    expect(s.saidas).toEqual([{ categoria: "Aluguel", total: "R$ 500,00" }]);
    expect(s.saidas[0]).not.toHaveProperty("itens");
    expect(s.resumo).toEqual({ entradas: "R$ 0,00", saidas: "R$ 500,00", resultado: "-R$ 500,00", saldoFimMes: "-R$ 10,00" });
  });

  it("mês corrente: parcial com data de corte no rótulo", () => {
    const s = montarSnapshot(base({ mes: 10, dataCorte: dia("2026-10-27"), parcial: true, entradas: [], saidas: [] }));
    expect(s.parcial).toBe(true);
    expect(s.dataCorte).toBe("27/10/2026");
    expect(s.rotulo).toBe("Outubro de 2026 (parcial, até 27/10/2026)");
  });

  it("é JSON puro (sobrevive a ida e volta)", () => {
    const s = montarSnapshot(base());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
