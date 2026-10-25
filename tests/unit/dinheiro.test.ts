import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { formatarBRL, parseValorBR } from "@/lib/dinheiro";
import { ErroApp, NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";

describe("parseValorBR", () => {
  test.each([
    ["1.234,56", "1234.56"],
    ["50", "50"],
    ["0,5", "0.5"],
    ["R$ 10,00", "10"],
    [" 7,90 ", "7.9"],
  ])("parseValorBR(%s)", (t, esperado) => {
    expect(parseValorBR(t).equals(esperado)).toBe(true);
  });

  test.each(["1,234.56", "", "0", "-5", "abc", "1,234", "12,345"])(
    "parseValorBR recusa %s",
    (t) => {
      expect(() => parseValorBR(t)).toThrow(Validacao);
    },
  );

  test("recusa com mensagem pt-BR", () => {
    expect(() => parseValorBR("abc")).toThrow("Valor inválido");
  });

  test.each(["0", "0,00", "R$ 0,0", "00"])("aceita zero %s só com permitirZero", (t) => {
    expect(() => parseValorBR(t)).toThrow(Validacao);
    expect(parseValorBR(t, { permitirZero: true }).isZero()).toBe(true);
  });

  test.each(["-5", "-0", "abc", ""])("permitirZero continua recusando %s", (t) => {
    expect(() => parseValorBR(t, { permitirZero: true })).toThrow(Validacao);
  });

  test.each(["0.500", "00.001", "0.001", "01.000"])("recusa milhares começando com zero: %s", (t) => {
    expect(() => parseValorBR(t)).toThrow("Valor inválido");
  });

  test("milhares e inteiro sem agrupamento continuam aceitos", () => {
    expect(parseValorBR("1.000").equals("1000")).toBe(true);
    expect(parseValorBR("007").equals("7")).toBe(true);
  });

  test("aceita o máximo de Decimal(12,2)", () => {
    expect(parseValorBR("9.999.999.999,99").equals("9999999999.99")).toBe(true);
    expect(parseValorBR("9999999999,99").equals("9999999999.99")).toBe(true);
  });

  test.each(["10.000.000.000,00", "10000000000", "99999999999,99", "1000000000000"])(
    "recusa acima do limite: %s",
    (t) => {
      let erro: unknown;
      try {
        parseValorBR(t, { permitirZero: true });
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(Validacao);
      expect((erro as Validacao).message).toBe("Valor acima do limite permitido");
      expect((erro as Validacao).regra).toBe("acima_limite");
    },
  );

  test("permitirZero não afeta valores positivos", () => {
    expect(parseValorBR("1.234,56", { permitirZero: true }).equals("1234.56")).toBe(true);
  });
});

describe("formatarBRL", () => {
  test("formata com separadores brasileiros", () => {
    expect(formatarBRL(new Prisma.Decimal("1234.5"))).toBe("R$ 1.234,50");
  });

  test("aceita string e valores pequenos", () => {
    expect(formatarBRL("0.5")).toBe("R$ 0,50");
  });
});

describe("erros tipados", () => {
  test("subclasses são instâncias de ErroApp com codigo e name", () => {
    const e = new Validacao("campo obrigatório");
    expect(e).toBeInstanceOf(ErroApp);
    expect(e).toBeInstanceOf(Validacao);
    expect(e).toBeInstanceOf(Error);
    expect(e.codigo).toBe("VALIDACAO");
    expect(e.name).toBe("Validacao");
    expect(e.message).toBe("campo obrigatório");
  });

  test.each([
    [new NaoAutorizado("x"), "NAO_AUTORIZADO"],
    [new NaoEncontrado("x"), "NAO_ENCONTRADO"],
    [new RegraDeNegocio("x"), "REGRA_DE_NEGOCIO"],
  ])("codigo de %#", (erro, codigo) => {
    expect(erro).toBeInstanceOf(ErroApp);
    expect(erro.codigo).toBe(codigo);
    expect(erro.name).toBe(erro.constructor.name);
  });
});
