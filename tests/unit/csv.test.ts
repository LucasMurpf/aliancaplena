import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { gerarCsv } from "@/lib/csv";

type Linha = { nome: string; valor: Prisma.Decimal | null; data: Date | null };

const colunas = [
  { titulo: "Nome", valor: (l: Linha) => l.nome },
  { titulo: "Valor", valor: (l: Linha) => l.valor },
  { titulo: "Data", valor: (l: Linha) => l.data },
];

describe("gerarCsv", () => {
  test("começa com BOM e usa ';' e CRLF", () => {
    const csv = gerarCsv(colunas, []);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Nome;Valor;Data\r\n");
  });

  test("escapa texto com ';' e aspas", () => {
    const csv = gerarCsv(colunas, [{ nome: 'Ação; "x"', valor: null, data: null }]);
    expect(csv).toContain('"Ação; ""x"""');
  });

  test("neutraliza fórmula com apóstrofo", () => {
    const csv = gerarCsv(colunas, [{ nome: "=SOMA(A1)", valor: null, data: null }]);
    expect(csv).toContain("'=SOMA(A1)");
  });

  test("Decimal negativo sai com vírgula e sem apóstrofo", () => {
    const csv = gerarCsv(colunas, [{ nome: "x", valor: new Prisma.Decimal(-120), data: null }]);
    expect(csv).toContain(";-120,00;");
    expect(csv).not.toContain("'-120,00");
  });

  test("valor com quebra de linha é entre aspas", () => {
    const csv = gerarCsv(colunas, [{ nome: "linha1\nlinha2", valor: null, data: null }]);
    expect(csv).toContain('"linha1\nlinha2"');
  });

  test("Decimal não finito lança erro em vez de escrever NaN", () => {
    const linhas = [{ nome: "x", valor: new Prisma.Decimal("NaN"), data: null }];
    expect(() => gerarCsv(colunas, linhas)).toThrow(Error);
  });

  test("Date inválida lança erro em vez de escrever NaN", () => {
    const linhas = [{ nome: "x", valor: null, data: new Date("nao-e-data") }];
    expect(() => gerarCsv(colunas, linhas)).toThrow(Error);
  });

  test("Date sai como dd/mm/aaaa e null vira vazio", () => {
    const csv = gerarCsv(colunas, [{ nome: "x", valor: null, data: new Date(Date.UTC(2026, 9, 31)) }]);
    expect(csv).toContain("x;;31/10/2026");
  });
});
