import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, Validacao } from "@/lib/erros";
import {
  csvDe,
  relatorioArrecadacao,
  relatorioContribuicoes,
  relatorioDespesas,
  relatorioGeral,
} from "@/lib/services/relatorios";
import { cancelarLancamento, criarLancamento, type DadosLancamento } from "@/lib/services/lancamentos";
import { resumoMes } from "@/lib/services/resumo";
import { criarConta, criarMembro } from "@/lib/services/cadastros";
import { criarTransferencia } from "@/lib/services/transferencias";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let banco: Conta;
let dizimo: Categoria;
let oferta: Categoria;
let saidaA: Categoria;
let saidaB: Categoria;
let joao: Membro;
let maria: Membro;

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja Aliança",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "100,00",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  tesoureiro = await criarUsuario(admin, { nome: "tes", email: "tes@igreja.org", senha: "senha-forte-123", papeis: ["TESOUREIRO"] });
  eventos = await criarUsuario(admin, { nome: "eventos", email: "ev@igreja.org", senha: "senha-forte-123", papeis: ["EVENTOS"] });
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0,00" });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  const saidas = await prisma.categoria.findMany({ where: { tipo: "SAIDA" }, orderBy: { nome: "asc" }, take: 2 });
  saidaA = saidas[0];
  saidaB = saidas[1];
  joao = await criarMembro(admin, { nome: "João da Silva" });
  maria = await criarMembro(admin, { nome: "Maria Souza" });
});

const lanc = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "100,00",
  categoriaId: oferta.id,
  contaId: caixa.id,
  dataVencimento: "10/10/2026",
  realizado: true,
  dataRealizacao: "10/10/2026",
  ...o,
});
const saida = (o: Partial<DadosLancamento> = {}) => lanc({ tipo: "SAIDA", categoriaId: saidaA.id, ...o });
const outubro = { de: "2026-10-01", ate: "2026-10-31" };

describe("relatorioGeral", () => {
  it("totais batem com resumoMes; cancelados e transferências ficam fora", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "300,00" }));
    await criarLancamento(tesoureiro, lanc({ valor: "50,50", dataRealizacao: "31/10/2026", dataVencimento: "31/10/2026" }));
    await criarLancamento(tesoureiro, saida({ valor: "120,25" }));
    const c = await criarLancamento(tesoureiro, lanc({ valor: "999,00" }));
    await cancelarLancamento(tesoureiro, c.id, "erro");
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "77,00", data: "12/10/2026" });
    const r = await relatorioGeral(tesoureiro, outubro);
    const resumo = await resumoMes(tesoureiro, 2026, 10);
    expect(r.totalEntradas.toString()).toBe(resumo.entradas.toString());
    expect(r.totalSaidas.toString()).toBe(resumo.saidas.toString());
    expect(r.resultado.toString()).toBe(resumo.resultado.toString());
    expect(r.linhas).toHaveLength(3);
    expect(r.rotuloPeriodo).toBe("01/10/2026 a 31/10/2026");
    expect(r.conta).toBeNull();
    expect(r.categoria).toBeNull();
  });

  it("31/10 entra em outubro e 01/11 fica fora (TZ=UTC); aceita dd/mm/aaaa", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "10,00", dataVencimento: "31/10/2026", dataRealizacao: "31/10/2026" }));
    await criarLancamento(tesoureiro, lanc({ valor: "20,00", dataVencimento: "01/11/2026", dataRealizacao: "01/11/2026" }));
    const r = await relatorioGeral(tesoureiro, { de: "01/10/2026", ate: "31/10/2026" });
    expect(r.linhas.map((l) => l.valor.toString())).toEqual(["10"]);
    expect(r.linhas[0].data.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("previstos só com a flag, pelo vencimento", async () => {
    await criarLancamento(tesoureiro, lanc());
    await criarLancamento(tesoureiro, lanc({ valor: "40,00", realizado: false, dataRealizacao: undefined, dataVencimento: "20/10/2026" }));
    expect((await relatorioGeral(tesoureiro, outubro)).linhas).toHaveLength(1);
    const r = await relatorioGeral(tesoureiro, { ...outubro, incluirPrevistos: true });
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas.filter((l) => l.previsto)).toHaveLength(1);
    expect(r.linhas[1].data.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("filtra por conta e categoria e devolve os nomes", async () => {
    await criarLancamento(tesoureiro, lanc());
    await criarLancamento(tesoureiro, lanc({ contaId: banco.id, categoriaId: dizimo.id, membroId: joao.id }));
    const r = await relatorioGeral(tesoureiro, { ...outubro, contaId: banco.id });
    expect(r.linhas).toHaveLength(1);
    expect(r.conta).toBe("Banco");
    const r2 = await relatorioGeral(tesoureiro, { ...outubro, categoriaId: oferta.id });
    expect(r2.categoria).toBe("Oferta");
    expect(r2.linhas).toHaveLength(1);
    await expect(relatorioGeral(tesoureiro, { ...outubro, contaId: "x" })).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("valida período", async () => {
    await expect(relatorioGeral(tesoureiro, { de: "2026-10-31", ate: "2026-10-01" })).rejects.toMatchObject({
      campo: "ate",
      regra: "periodo_invertido",
    });
    await expect(relatorioGeral(tesoureiro, { de: "2025-01-01", ate: "2026-10-01" })).rejects.toMatchObject({
      regra: "periodo_longo",
    });
    await expect(relatorioGeral(tesoureiro, { de: "lixo", ate: "2026-10-01" })).rejects.toBeInstanceOf(Validacao);
    await expect(relatorioGeral(eventos, outubro)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("nome de membro não aparece no Geral nem nas Despesas", async () => {
    await criarLancamento(tesoureiro, lanc({ categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, saida());
    const geral = JSON.stringify(await relatorioGeral(tesoureiro, outubro));
    const desp = JSON.stringify(await relatorioDespesas(tesoureiro, outubro));
    const arr = JSON.stringify(await relatorioArrecadacao(tesoureiro, outubro));
    for (const s of [geral, desp, arr]) expect(s).not.toContain("João");
  });
});

describe("relatorioArrecadacao", () => {
  it("soma 100,00% com o resto absorvido pela última categoria", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "100,00", categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, lanc({ valor: "100,00" }));
    const outra = await prisma.categoria.findFirstOrThrow({ where: { tipo: "ENTRADA", nominal: false, id: { not: oferta.id } } });
    await criarLancamento(tesoureiro, lanc({ valor: "100,00", categoriaId: outra.id }));
    const r = await relatorioArrecadacao(tesoureiro, outubro);
    expect(r.categorias).toHaveLength(3);
    expect(r.total.toString()).toBe("300");
    const soma = r.categorias.reduce((a, c) => a.add(c.percentual), r.categorias[0].percentual.mul(0));
    expect(soma.toFixed(2)).toBe("100.00");
    expect(r.categorias.map((c) => c.quantidade)).toEqual([1, 1, 1]);
  });

  it("sem lançamentos: lista vazia, total zero", async () => {
    const r = await relatorioArrecadacao(tesoureiro, outubro);
    expect(r.categorias).toEqual([]);
    expect(r.total.toString()).toBe("0");
  });
});

describe("relatorioDespesas", () => {
  it("agrupa por categoria com subtotal e total; ignora entradas e cancelados", async () => {
    await criarLancamento(tesoureiro, saida({ valor: "10,00", descricao: "a" }));
    await criarLancamento(tesoureiro, saida({ valor: "15,50", descricao: "b", dataRealizacao: "12/10/2026" }));
    await criarLancamento(tesoureiro, saida({ valor: "7,00", categoriaId: saidaB.id, contaId: banco.id }));
    const x = await criarLancamento(tesoureiro, saida({ valor: "500,00" }));
    await cancelarLancamento(tesoureiro, x.id, "erro");
    await criarLancamento(tesoureiro, lanc());
    const r = await relatorioDespesas(tesoureiro, outubro);
    expect(r.grupos).toHaveLength(2);
    const ga = r.grupos.find((g) => g.categoria === saidaA.nome)!;
    expect(ga.itens.map((i) => i.descricao)).toEqual(["a", "b"]);
    expect(ga.subtotal.toString()).toBe("25.5");
    expect(ga.itens[0].conta).toBe("Caixa");
    expect(r.total.toString()).toBe("32.5");
  });
});

describe("relatorioContribuicoes", () => {
  beforeEach(async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "50,00", categoriaId: dizimo.id, membroId: maria.id }));
    await criarLancamento(tesoureiro, lanc({ valor: "30,00", categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, lanc({ valor: "20,00", categoriaId: dizimo.id, membroId: joao.id, dataRealizacao: "05/10/2026" }));
    await criarLancamento(tesoureiro, lanc({ valor: "999,00" }));
  });

  it("sem permissão → NaoAutorizado", async () => {
    await expect(relatorioContribuicoes(eventos, outubro)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(relatorioContribuicoes(null, outubro)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("modo todos: por membro, ordenado por nome", async () => {
    const r = await relatorioContribuicoes(tesoureiro, outubro);
    if (!("porMembro" in r)) throw new Error("esperava porMembro");
    expect(r.porMembro.map((m) => [m.membro, m.quantidade, m.total.toString()])).toEqual([
      ["João da Silva", 2, "50"],
      ["Maria Souza", 1, "50"],
    ]);
    expect(r.total.toString()).toBe("100");
  });

  it("modo membro: itens por data", async () => {
    const r = await relatorioContribuicoes(tesoureiro, { ...outubro, membroId: joao.id });
    if (!("itens" in r)) throw new Error("esperava itens");
    expect(r.membro).toBe("João da Silva");
    expect(r.itens.map((i) => i.valor.toString())).toEqual(["20", "30"]);
    expect(r.itens[0].categoria).toBe("Dízimo");
    expect(r.total.toString()).toBe("50");
    await expect(relatorioContribuicoes(tesoureiro, { ...outubro, membroId: "nao" })).rejects.toThrow("Membro não encontrado");
  });
});

describe("csvDe", () => {
  it("Geral: cabeçalho + N linhas, Tipo/Situação em pt-BR", async () => {
    await criarLancamento(tesoureiro, lanc());
    await criarLancamento(tesoureiro, saida({ valor: "12,30", descricao: "luz; água" }));
    await criarLancamento(tesoureiro, lanc({ realizado: false, dataRealizacao: undefined, dataVencimento: "20/10/2026" }));
    const r = await relatorioGeral(tesoureiro, { ...outubro, incluirPrevistos: true });
    const linhas = csvDe("geral", r).replace("﻿", "").trimEnd().split("\r\n");
    expect(linhas).toHaveLength(r.linhas.length + 1);
    expect(linhas[0]).toBe("Data;Tipo;Categoria;Conta;Descrição;Valor;Situação");
    expect(linhas[1]).toBe(`10/10/2026;Entrada;Oferta;Caixa;;100,00;Realizado`);
    expect(linhas[2]).toContain(`;Saída;`);
    expect(linhas[2]).toContain(`"luz; água";12,30;Realizado`);
    expect(linhas[3]).toMatch(/Previsto$/);
  });

  it("Arrecadação, Despesas e Contribuições", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "10,00" }));
    await criarLancamento(tesoureiro, saida({ valor: "4,00", descricao: "x" }));
    await criarLancamento(tesoureiro, lanc({ valor: "30,00", categoriaId: dizimo.id, membroId: joao.id }));
    const arr = csvDe("arrecadacao", await relatorioArrecadacao(tesoureiro, outubro)).replace("﻿", "").split("\r\n");
    expect(arr[0]).toBe("Categoria;Quantidade;Total;Percentual");
    expect(arr[1]).toBe("Dízimo;1;30,00;75,00");
    const desp = csvDe("despesas", await relatorioDespesas(tesoureiro, outubro)).replace("﻿", "").split("\r\n");
    expect(desp[0]).toBe("Categoria;Data;Descrição;Conta;Valor");
    expect(desp[1]).toBe(`${saidaA.nome};10/10/2026;x;Caixa;4,00`);
    const todos = csvDe("contribuicoes", await relatorioContribuicoes(tesoureiro, outubro)).replace("﻿", "").split("\r\n");
    expect(todos[0]).toBe("Membro;Quantidade;Total");
    expect(todos[1]).toBe("João da Silva;1;30,00");
    const um = csvDe("contribuicoes", await relatorioContribuicoes(tesoureiro, { ...outubro, membroId: joao.id })).replace("﻿", "").split("\r\n");
    expect(um[0]).toBe("Data;Categoria;Valor");
    expect(um[1]).toBe("10/10/2026;Dízimo;30,00");
  });
});
