import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { agruparTopComOutras, chaveMes, mesAnterior, mesSeguinte, parseMes, rotuloMes } from "@/lib/dashboard";

const hoje = new Date(Date.UTC(2026, 9, 24));
const d = (v: string) => new Prisma.Decimal(v);

describe("parseMes", () => {
  it("aceita aaaa-mm válido", () => {
    expect(parseMes("2026-03", hoje)).toEqual({ ano: 2026, mes: 3 });
  });
  it.each([undefined, "", "2026-13", "2026-00", "2026-1", "abc", "2026-10-01", "1999-12", "2101-01", " 2026-10"])(
    "inválido %j volta ao mês atual de SP",
    (v) => {
      expect(parseMes(v, hoje)).toEqual({ ano: 2026, mes: 10 });
    },
  );
  it("usa o primeiro valor quando vem lista", () => {
    expect(parseMes(["2026-02", "2026-03"], hoje)).toEqual({ ano: 2026, mes: 2 });
  });
});

describe("navegação de mês", () => {
  it("vira o ano", () => {
    expect(mesAnterior({ ano: 2026, mes: 1 })).toEqual({ ano: 2025, mes: 12 });
    expect(mesSeguinte({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 });
    expect(mesAnterior({ ano: 2026, mes: 10 })).toEqual({ ano: 2026, mes: 9 });
    expect(mesSeguinte({ ano: 2026, mes: 10 })).toEqual({ ano: 2026, mes: 11 });
  });
  it("não sai do intervalo suportado", () => {
    expect(mesAnterior({ ano: 2000, mes: 1 })).toBeNull();
    expect(mesSeguinte({ ano: 2100, mes: 12 })).toBeNull();
  });
  it("chave e rótulo", () => {
    expect(chaveMes({ ano: 2026, mes: 3 })).toBe("2026-03");
    expect(rotuloMes({ ano: 2026, mes: 3 })).toBe("março de 2026");
  });
});

describe("agruparTopComOutras", () => {
  const item = (categoria: string, v: string) => ({ categoria, total: d(v) });
  it("vazio devolve vazio", () => {
    expect(agruparTopComOutras([])).toEqual([]);
  });
  it("até 6 itens: sem Outras", () => {
    const r = agruparTopComOutras([item("A", "10"), item("B", "5")]);
    expect(r.map((x) => x.categoria)).toEqual(["A", "B"]);
    expect(r.some((x) => x.outras)).toBe(false);
  });
  it("exatamente 7: top 6 + Outras com 1 item", () => {
    const r = agruparTopComOutras(["7", "6", "5", "4", "3", "2", "1"].map((v, i) => item(`C${i}`, v)));
    expect(r).toHaveLength(7);
    expect(r[6]).toMatchObject({ categoria: "Outras", outras: true });
    expect(r[6].total.toString()).toBe("1");
  });
  it("soma o resto em Outras sem perder centavos e ordena por total", () => {
    const r = agruparTopComOutras([
      item("a", "0.10"), item("b", "100"), item("c", "50"), item("d", "40"),
      item("e", "30"), item("f", "20"), item("g", "0.20"), item("h", "10"),
    ]);
    expect(r.map((x) => x.categoria)).toEqual(["b", "c", "d", "e", "f", "h", "Outras"]);
    expect(r[6].total.toString()).toBe("0.3");
  });
});
