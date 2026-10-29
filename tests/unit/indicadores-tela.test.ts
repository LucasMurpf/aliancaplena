import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { Indicadores, Comparativo } from "@/lib/services/indicadores";
import { adaptarIndicadores, formatarVariacao, rotuloMesCartao } from "@/lib/indicadores-tela";
import { compactoBRL } from "@/lib/formatacao-eixo";

const D = (v: string | number) => new Prisma.Decimal(v);

function comp(over: Partial<Comparativo> = {}): Comparativo {
  return { atual: D(0), mesmoMesAnoAnterior: D(0), media12: D(0), varAnoAnterior: null, varMedia: null, ...over };
}

function base(over: Partial<Indicadores> = {}): Indicadores {
  const meses = Array.from({ length: 13 }, (_, i) => {
    const mes = ((9 + i) % 12) + 1; // começa em out
    const ano = 2025 + Math.floor((9 + i) / 12);
    return {
      ano,
      mes,
      rotulo: `m${i}`,
      entradas: D(0),
      saidas: D(0),
      resultado: D(0),
      saldoFim: D(0),
      contribuintes: 0,
    };
  });
  return {
    meses,
    porCategoria: [],
    comparativos: { entradas: comp(), saidas: comp() },
    ...over,
  };
}

describe("formatarVariacao", () => {
  it("null vira travessão sem seta", () => {
    expect(formatarVariacao(null)).toEqual({ texto: "—", direcao: "nenhuma", leitura: "sem base de comparação" });
  });
  it("positivo ganha + e vírgula", () => {
    expect(formatarVariacao(D("12.3"))).toMatchObject({ texto: "+12,3%", direcao: "alta" });
  });
  it("negativo usa sinal de menos tipográfico", () => {
    expect(formatarVariacao(D("-4.5"))).toMatchObject({ texto: "−4,5%", direcao: "queda" });
  });
  it("zero é estável", () => {
    expect(formatarVariacao(D(0))).toMatchObject({ texto: "0,0%", direcao: "estavel" });
  });
  it("agrupa milhar", () => {
    expect(formatarVariacao(D("1234.5")).texto).toBe("+1.234,5%");
  });
  it("leitura por extenso para leitor de tela", () => {
    expect(formatarVariacao(D("12.3")).leitura).toBe("aumento de 12,3%");
    expect(formatarVariacao(D("-4.5")).leitura).toBe("redução de 4,5%");
  });
});

describe("adaptarIndicadores", () => {
  it("13 zeros é estado vazio", () => {
    expect(adaptarIndicadores(base()).vazio).toBe(true);
  });
  it("qualquer valor torna não vazio", () => {
    const b = base();
    b.meses[5].saidas = D("10");
    expect(adaptarIndicadores(b).vazio).toBe(false);
  });
  it("converte dinheiro em texto BRL + número só para geometria", () => {
    const b = base();
    b.meses[12].entradas = D("1234.5");
    b.meses[12].resultado = D("-20");
    const m = adaptarIndicadores(b).meses[12];
    expect(m.entradas).toEqual({ texto: "R$ 1.234,50", valor: 1234.5 });
    expect(m.resultado).toEqual({ texto: "-R$ 20,00", valor: -20 });
  });
  it("rótulo longo do mês em pt-BR", () => {
    const m = adaptarIndicadores(base()).meses;
    expect(m[0].rotuloLongo).toBe("outubro de 2025");
    expect(m[12].rotuloLongo).toBe("outubro de 2026");
  });
  it("categorias mantêm ordem e convertem valores", () => {
    const valores = Array.from({ length: 13 }, (_, i) => D(i));
    const r = adaptarIndicadores(base({ porCategoria: [{ categoria: "Dízimos", valores }] }));
    expect(r.categorias[0].nome).toBe("Dízimos");
    expect(r.categorias[0].valores[3]).toEqual({ texto: "R$ 3,00", valor: 3 });
  });
  it("cartões comparativos formatam valores e variações", () => {
    const r = adaptarIndicadores(
      base({
        comparativos: {
          entradas: comp({ atual: D(110), mesmoMesAnoAnterior: D(100), media12: D(0), varAnoAnterior: D("10"), varMedia: null }),
          saidas: comp(),
        },
      }),
    );
    expect(r.comparativos.entradas.atual).toBe("R$ 110,00");
    expect(r.comparativos.entradas.anoAnterior.texto).toBe("R$ 100,00");
    expect(r.comparativos.entradas.anoAnterior.variacao.texto).toBe("+10,0%");
    expect(r.comparativos.entradas.media12.variacao.texto).toBe("—");
  });
  it("resultado é serializável (sem Decimal)", () => {
    const b = base();
    b.meses[1].entradas = D("5");
    const json = JSON.stringify(adaptarIndicadores(b));
    expect(JSON.parse(json).meses[1].entradas.valor).toBe(5);
  });
});

describe("compactoBRL", () => {
  it("abrevia milhares e milhões", () => {
    expect(compactoBRL(0)).toBe("0");
    expect(compactoBRL(850)).toBe("850");
    expect(compactoBRL(1500)).toBe("1,5 mil");
    expect(compactoBRL(12000)).toBe("12 mil");
    expect(compactoBRL(2_300_000)).toBe("2,3 mi");
    expect(compactoBRL(-4000)).toBe("−4 mil");
  });
});

describe("rotuloMesCartao", () => {
  const out = { ano: 2026, mes: 10, rotuloLongo: "outubro de 2026" };
  it("mês em andamento leva 'até dd/mm'", () => {
    expect(rotuloMesCartao(out, new Date("2026-10-28T00:00:00Z"))).toBe("outubro de 2026 (até 28/10)");
    expect(rotuloMesCartao(out, new Date("2026-10-03T00:00:00Z"))).toBe("outubro de 2026 (até 03/10)");
  });
  it("mês que não é o corrente fica só com o nome", () => {
    expect(rotuloMesCartao(out, new Date("2026-11-02T00:00:00Z"))).toBe("outubro de 2026");
    expect(rotuloMesCartao(out, new Date("2027-10-02T00:00:00Z"))).toBe("outubro de 2026");
  });
  it("adaptarIndicadores expõe ano e mês de cada mês", () => {
    const m = adaptarIndicadores(base()).meses[12];
    expect([m.ano, m.mes]).toEqual([2026, 10]);
  });
});
