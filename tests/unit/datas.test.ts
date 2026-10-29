import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dataPorExtenso, formatarDataBR, formatarDataSP, hojeSP, limitesDoMes, parseDataBR } from "@/lib/datas";
import { Validacao } from "@/lib/erros";

describe("parseDataBR", () => {
  test("dd/mm/aaaa retorna meia-noite UTC", () => {
    expect(parseDataBR("31/10/2026").toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  test("aaaa-mm-dd também é aceito", () => {
    expect(parseDataBR("2026-10-31").toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  test("recusa data impossível", () => {
    expect(() => parseDataBR("31/02/2026")).toThrow(Validacao);
    expect(() => parseDataBR("31/02/2026")).toThrow("Data inválida");
  });

  test("recusa formato inválido", () => {
    expect(() => parseDataBR("2026/10/31")).toThrow(Validacao);
    expect(() => parseDataBR("")).toThrow(Validacao);
  });
});

describe("formatarDataBR", () => {
  test("formata dd/mm/aaaa", () => {
    expect(formatarDataBR(new Date("2026-10-05T00:00:00.000Z"))).toBe("05/10/2026");
  });
});

describe("limitesDoMes", () => {
  test("limites de outubro (fim exclusivo)", () => {
    const { inicio, fim } = limitesDoMes(2026, 10);
    expect(inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  test("dezembro vira o ano", () => {
    const { fim } = limitesDoMes(2026, 12);
    expect(fim.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("hojeSP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("usa o dia de São Paulo, não o UTC", () => {
    // 02:30 UTC de 24/10 = 23:30 de 23/10 em São Paulo (UTC-3).
    vi.setSystemTime(new Date("2026-10-24T02:30:00.000Z"));
    expect(hojeSP().toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });

  test("após meia-noite em SP já é o dia seguinte", () => {
    // 03:30 UTC de 24/10 = 00:30 de 24/10 em São Paulo.
    vi.setSystemTime(new Date("2026-10-24T03:30:00.000Z"));
    expect(hojeSP().toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });
});

describe("dataPorExtenso", () => {
  test("dia, mês em minúsculo e ano", () => {
    expect(dataPorExtenso(new Date("2026-10-27T00:00:00.000Z"))).toBe("27 de outubro de 2026");
    expect(dataPorExtenso(new Date("2026-03-01T00:00:00.000Z"))).toBe("1 de março de 2026");
  });

  test("usa os componentes UTC (a data guardada é o dia de negócio)", () => {
    expect(dataPorExtenso(new Date("2025-12-31T00:00:00.000Z"))).toBe("31 de dezembro de 2025");
    expect(dataPorExtenso(new Date("2026-01-01T00:00:00.000Z"))).toBe("1 de janeiro de 2026");
  });
});

describe("formatarDataSP", () => {
  test("contagem às 22:30 em São Paulo continua no mesmo dia (01:30Z do dia seguinte)", () => {
    const instante = new Date("2026-10-28T01:30:00.000Z");
    expect(formatarDataBR(instante)).toBe("28/10/2026");
    expect(formatarDataSP(instante)).toBe("27/10/2026");
  });
  test("às 21:00 SP e logo depois da meia-noite SP", () => {
    expect(formatarDataSP(new Date("2026-10-28T00:00:00.000Z"))).toBe("27/10/2026");
    expect(formatarDataSP(new Date("2026-10-28T03:00:00.000Z"))).toBe("28/10/2026");
  });
});
