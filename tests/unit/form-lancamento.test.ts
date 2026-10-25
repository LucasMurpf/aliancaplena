import { describe, expect, it } from "vitest";
import {
  aposSalvarELancarOutro,
  destinoDoErro,
  enviarAnexos,
  estadoInicial,
  formularioPreenchido,
  montarDados,
  normalizarValorDigitado,
  trocarTipo,
  type CategoriaForm,
} from "@/lib/form-lancamento";

const categorias: CategoriaForm[] = [
  { id: "dizimo", nome: "Dízimo", tipo: "ENTRADA", nominal: true },
  { id: "oferta", nome: "Oferta", tipo: "ENTRADA", nominal: false },
  { id: "agua", nome: "Água", tipo: "SAIDA", nominal: false },
];

describe("normalizarValorDigitado", () => {
  it.each([
    ["", ""],
    ["abc", ""],
    ["1234", "1234"],
    ["12,5", "12,5"],
    ["12.5", "12,5"],
    ["12.50", "12,50"],
    ["1.234,56", "1.234,56"],
    ["1.234", "1.234"],
    ["R$ 10,00", "10,00"],
    ["1,2,3", "1,23"],
    ["10,567", "10,56"],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizarValorDigitado(entrada)).toBe(esperado);
  });
});

describe("estadoInicial", () => {
  it("entrada, realizado, hoje e primeira conta", () => {
    expect(estadoInicial({ hoje: "2026-10-24", contaId: "caixa" })).toEqual({
      tipo: "ENTRADA",
      categoriaId: "",
      contaId: "caixa",
      membro: null,
      valor: "",
      descricao: "",
      data: "2026-10-24",
      realizado: true,
    });
  });
});

describe("trocarTipo", () => {
  it("limpa categoria e membro quando a categoria não é do novo tipo", () => {
    const e = { ...estadoInicial({ hoje: "2026-10-24", contaId: "c" }), categoriaId: "dizimo", membro: { id: "m", nome: "João" } };
    const novo = trocarTipo(e, "SAIDA", categorias);
    expect(novo.tipo).toBe("SAIDA");
    expect(novo.categoriaId).toBe("");
    expect(novo.membro).toBeNull();
  });
  it("mantém a categoria quando o tipo não muda", () => {
    const e = { ...estadoInicial({ hoje: "2026-10-24", contaId: "c" }), categoriaId: "oferta" };
    expect(trocarTipo(e, "ENTRADA", categorias).categoriaId).toBe("oferta");
  });
});

describe("aposSalvarELancarOutro", () => {
  it("mantém tipo, conta, categoria, data e situação; limpa valor, membro e descrição", () => {
    const e = {
      tipo: "ENTRADA" as const,
      categoriaId: "dizimo",
      contaId: "caixa",
      membro: { id: "m", nome: "João" },
      valor: "100,00",
      descricao: "culto",
      data: "2026-10-18",
      realizado: false,
    };
    expect(aposSalvarELancarOutro(e)).toEqual({
      tipo: "ENTRADA",
      categoriaId: "dizimo",
      contaId: "caixa",
      membro: null,
      valor: "",
      descricao: "",
      data: "2026-10-18",
      realizado: false,
    });
  });
});

describe("montarDados", () => {
  const base = { ...estadoInicial({ hoje: "2026-10-24", contaId: "caixa" }), categoriaId: "oferta", valor: "50,00" };

  it("realizado: vencimento e realização iguais à data", () => {
    expect(montarDados(base, categorias)).toEqual({
      tipo: "ENTRADA",
      valor: "50,00",
      categoriaId: "oferta",
      contaId: "caixa",
      membroId: null,
      descricao: "",
      dataVencimento: "2026-10-24",
      realizado: true,
      dataRealizacao: "2026-10-24",
    });
  });

  it("previsto: só vencimento", () => {
    const d = montarDados({ ...base, realizado: false }, categorias);
    expect(d.dataVencimento).toBe("2026-10-24");
    expect(d.realizado).toBe(false);
    expect(d.dataRealizacao).toBeUndefined();
  });

  it("só envia o membro quando a categoria é nominal", () => {
    const m = { id: "m1", nome: "João" };
    expect(montarDados({ ...base, categoriaId: "dizimo", membro: m }, categorias).membroId).toBe("m1");
    expect(montarDados({ ...base, categoriaId: "oferta", membro: m }, categorias).membroId).toBeNull();
  });

  it("edição de realizado preserva o vencimento original", () => {
    const d = montarDados({ ...base, data: "2026-10-20" }, categorias, "2026-10-10");
    expect(d.dataVencimento).toBe("2026-10-10");
    expect(d.dataRealizacao).toBe("2026-10-20");
  });
});

describe("formularioPreenchido", () => {
  const e = estadoInicial({ hoje: "2026-10-24", contaId: "caixa" });
  it("falso no estado inicial, mesmo com categoria escolhida", () => {
    expect(formularioPreenchido({ ...e, categoriaId: "oferta" }, 0)).toBe(false);
  });
  it("verdadeiro com valor, descrição, membro ou anexos", () => {
    expect(formularioPreenchido({ ...e, valor: "1" }, 0)).toBe(true);
    expect(formularioPreenchido({ ...e, descricao: "x" }, 0)).toBe(true);
    expect(formularioPreenchido({ ...e, membro: { id: "m", nome: "J" } }, 0)).toBe(true);
    expect(formularioPreenchido(e, 1)).toBe(true);
  });
});

describe("enviarAnexos", () => {
  const arq = (name: string) => ({ name });
  it("devolve os nomes que falharam, inclusive por exceção, sem lançar", async () => {
    const falhas = await enviarAnexos([arq("a"), arq("b"), arq("c")], async (f) => {
      if (f.name === "b") throw new Error("rede");
      return { ok: f.name === "a" };
    });
    expect(falhas).toEqual(["b", "c"]);
  });
  it("vazio quando tudo deu certo", async () => {
    expect(await enviarAnexos([arq("a")], async () => ({ ok: true }))).toEqual([]);
  });
});

describe("destinoDoErro", () => {
  const tela = ["valor", "categoria", "data"];
  it("campo existente na tela (com mapeamento)", () => {
    expect(destinoDoErro("valor", tela)).toBe("valor");
    expect(destinoDoErro("dataVencimento", tela, { dataVencimento: "data" })).toBe("data");
  });
  it("campo sem lugar na tela ou ausente → null (mensagem geral)", () => {
    expect(destinoDoErro("tipo", tela)).toBeNull();
    expect(destinoDoErro("membro", tela)).toBeNull();
    expect(destinoDoErro(undefined, tela)).toBeNull();
  });
});
