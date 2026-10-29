import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { valorPorExtenso } from "@/lib/extenso";
import { Validacao } from "@/lib/erros";

describe("valorPorExtenso", () => {
  test.each([
    ["1", "um real"],
    ["0.01", "um centavo"],
    ["2", "dois reais"],
    ["150", "cento e cinquenta reais"],
    ["100", "cem reais"],
    ["1001.05", "mil e um reais e cinco centavos"],
    ["2050.10", "dois mil e cinquenta reais e dez centavos"],
    ["1000000", "um milhão de reais"],
    ["2500000.50", "dois milhões e quinhentos mil reais e cinquenta centavos"],
    ["1100", "mil e cem reais"],
    ["1230", "mil duzentos e trinta reais"],
    ["0.50", "cinquenta centavos"],
    ["1200000", "um milhão e duzentos mil reais"],
    ["1000000000", "um bilhão de reais"],
    ["101", "cento e um reais"],
    ["1010", "mil e dez reais"],
    ["1000001", "um milhão e um reais"],
    ["21000000", "vinte e um milhões de reais"],
    ["1000000000.01", "um bilhão de reais e um centavo"],
  ])("valorPorExtenso(%s) = %s", (entrada, esperado) => {
    expect(valorPorExtenso(entrada)).toBe(esperado);
  });

  test("aceita Prisma.Decimal", () => {
    expect(valorPorExtenso(new Prisma.Decimal("1001.05"))).toBe("mil e um reais e cinco centavos");
  });

  test("aceita o valor máximo 9.999.999.999,99", () => {
    expect(() => valorPorExtenso("9999999999.99")).not.toThrow();
    expect(valorPorExtenso("9999999999.99")).toBe(
      "nove bilhões novecentos e noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove reais e noventa e nove centavos",
    );
  });

  test.each([["0"], ["-1"], ["-0.01"], ["10000000000"], ["9999999999.991"], ["NaN"], ["Infinity"]])(
    "rejeita valor fora do intervalo (%s)",
    (entrada) => {
      expect(() => valorPorExtenso(entrada)).toThrow(Validacao);
    },
  );
});
