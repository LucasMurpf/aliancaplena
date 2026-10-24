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
