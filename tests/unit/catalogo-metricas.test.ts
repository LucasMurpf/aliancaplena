import { describe, expect, it } from "vitest";
import { CATALOGO, normalizarTela, sanitizarEvento } from "@/lib/metricas/catalogo";
import { criarColetor, dispositivoPorLargura } from "@/lib/metricas/cliente";

describe("sanitizarEvento", () => {
  it("mantém só as chaves do catálogo", () => {
    const r = sanitizarEvento("lancamento_salvo", { tipo: "ENTRADA", comAnexo: true, valor: "1234,56", descricao: "x" });
    expect(r).toEqual({ nome: "lancamento_salvo", props: { tipo: "ENTRADA", comAnexo: true } });
  });
  it("evento desconhecido (inclusive herdado de Object) vira null", () => {
    expect(sanitizarEvento("hackeado", {})).toBeNull();
    expect(sanitizarEvento("constructor", {})).toBeNull();
    expect(sanitizarEvento("__proto__", {})).toBeNull();
  });
  it("descarta string de 41 chars, objetos e aceita 40", () => {
    const r = sanitizarEvento("lancamento_salvo", { tipo: "x".repeat(41), comAnexo: { a: 1 }, viaAtalho: false });
    expect(r?.props).toEqual({ viaAtalho: false });
    expect(sanitizarEvento("lancamento_salvo", { tipo: "x".repeat(40) })?.props.tipo).toHaveLength(40);
  });
  it("props inválidas viram {}", () => {
    expect(sanitizarEvento("login", null)?.props).toEqual({});
    expect(sanitizarEvento("login", [1, 2])?.props).toEqual({});
    expect(sanitizarEvento("login", "texto")?.props).toEqual({});
  });
  it("números não finitos são descartados", () => {
    expect(sanitizarEvento("erro_validacao", { campo: Infinity, regra: 3 })?.props).toEqual({ regra: 3 });
  });
  it("catálogo cobre os eventos da spec", () => {
    for (const n of ["login", "baixa_dada", "lancamento_cancelado", "transferencia_criada", "anexo_enviado", "membro_cadastrado_rapido", "erro_validacao"]) {
      expect(Object.keys(CATALOGO)).toContain(n);
    }
  });
});

describe("normalizarTela", () => {
  it("troca cuid e remove query", () => {
    expect(normalizarTela("/lancamentos/clx9a8b7c6d5e4f3g2h1?pagina=2")).toBe("/lancamentos/[id]");
  });
  it("troca números, uuid e remove hash", () => {
    expect(normalizarTela("/membros/123/editar#topo")).toBe("/membros/[id]/editar");
    expect(normalizarTela("/x/123e4567-e89b-12d3-a456-426614174000")).toBe("/x/[id]");
  });
  it("mantém rotas normais, limita a 120 chars e trata lixo", () => {
    expect(normalizarTela("/lancamentos/novo")).toBe("/lancamentos/novo");
    expect(normalizarTela("/" + "a".repeat(300)).length).toBeLessThanOrEqual(120);
    expect(normalizarTela("")).toBe("/");
  });
});

describe("cliente: dispositivo e fila", () => {
  it("dispositivo por largura", () => {
    expect(dispositivoPorLargura(375)).toBe("CELULAR");
    expect(dispositivoPorLargura(767)).toBe("CELULAR");
    expect(dispositivoPorLargura(768)).toBe("TABLET");
    expect(dispositivoPorLargura(1023)).toBe("TABLET");
    expect(dispositivoPorLargura(1024)).toBe("PC");
  });
  it("junta eventos em lote e esvazia a fila", () => {
    const lotes: unknown[][] = [];
    const c = criarColetor({ enviar: (l) => lotes.push(l), dispositivo: () => "PC", sessaoId: () => "s1", tela: () => "/x" });
    c.rastrear("login");
    c.rastrear("lancamento_salvo", { tipo: "ENTRADA" }, 1500);
    expect(c.tamanho()).toBe(2);
    c.descarregar();
    c.descarregar();
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toHaveLength(2);
    expect(lotes[0][1]).toMatchObject({ nome: "lancamento_salvo", tela: "/x", duracaoMs: 1500, dispositivo: "PC", sessaoId: "s1", props: { tipo: "ENTRADA" } });
    expect(c.tamanho()).toBe(0);
  });
  it("limita a fila e quebra lotes em 50", () => {
    const lotes: unknown[][] = [];
    const c = criarColetor({ enviar: (l) => lotes.push(l), dispositivo: () => "PC", sessaoId: () => undefined, tela: () => "/" });
    for (let i = 0; i < 120; i++) c.rastrear("tela_aberta");
    c.descarregar();
    expect(lotes.map((l) => l.length)).toEqual([50, 50, 20]);
  });
  it("erro ao enviar nunca propaga", () => {
    const c = criarColetor({ enviar: () => { throw new Error("x"); }, dispositivo: () => "PC", sessaoId: () => undefined, tela: () => "/" });
    c.rastrear("login");
    expect(() => c.descarregar()).not.toThrow();
  });
});
