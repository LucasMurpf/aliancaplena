import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Conta } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, Validacao } from "@/lib/erros";
import { alertas, resumoMes, saldoPorConta, saldoTotal } from "@/lib/services/resumo";
import {
  cancelarLancamento,
  criarLancamento,
  darBaixa,
  type DadosLancamento,
} from "@/lib/services/lancamentos";
import { cancelarTransferencia, criarTransferencia } from "@/lib/services/transferencias";
import { criarCategoria, criarConta, definirContaAtiva } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

// Review Focus 2: as datas não podem depender do fuso do processo.
const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let banco: Conta;
let oferta: Categoria;
let doacao: Categoria;
let agua: Categoria;
let luz: Categoria;

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "100,00",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  const mk = (nome: string, papeis: ("PASTOR" | "TESOUREIRO" | "EVENTOS")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  pastor = await mk("pastor", ["PASTOR"]);
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  eventos = await mk("eventos", ["EVENTOS"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0" });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  doacao = await prisma.categoria.findFirstOrThrow({ where: { nome: "Doação", tipo: "ENTRADA" } });
  agua = await prisma.categoria.findFirstOrThrow({ where: { nome: "Água", tipo: "SAIDA" } });
  luz = await prisma.categoria.findFirstOrThrow({ where: { nome: "Luz", tipo: "SAIDA" } });
});

const lanc = (o: Partial<DadosLancamento> = {}) =>
  criarLancamento(tesoureiro, {
    tipo: "ENTRADA",
    valor: "50,00",
    categoriaId: oferta.id,
    contaId: caixa.id,
    dataVencimento: "10/10/2026",
    realizado: true,
    ...o,
  });
const saida = (o: Partial<DadosLancamento> = {}) =>
  lanc({ tipo: "SAIDA", valor: "30,00", categoriaId: agua.id, ...o });

const saldoDe = async (contaId: string) =>
  (await saldoPorConta(pastor)).find((s) => s.contaId === contaId)?.saldo.toString();

describe("saldoPorConta / saldoTotal", () => {
  it("saldo inicial + entradas realizadas − saídas realizadas; previsto não conta; baixa conta", async () => {
    await lanc();
    await saida();
    const prevista = await lanc({ valor: "999,00", realizado: false });
    expect(await saldoDe(caixa.id)).toBe("120");
    expect((await saldoTotal(pastor)).toString()).toBe("120");

    await darBaixa(tesoureiro, prevista.id, "15/10/2026");
    expect(await saldoDe(caixa.id)).toBe("1119");
    expect((await saldoTotal(pastor)).toString()).toBe("1119");
  });

  it("transferência move saldo entre contas, não altera o resumo e volta ao cancelar", async () => {
    await lanc();
    await saida();
    const antes = await resumoMes(pastor, 2026, 10);

    const t = await criarTransferencia(tesoureiro, {
      contaOrigemId: caixa.id,
      contaDestinoId: banco.id,
      valor: "20,00",
      data: "12/10/2026",
    });
    expect(await saldoDe(caixa.id)).toBe("100");
    expect(await saldoDe(banco.id)).toBe("20");
    expect((await saldoTotal(pastor)).toString()).toBe("120");
    expect(await resumoMes(pastor, 2026, 10)).toEqual(antes);

    await cancelarTransferencia(tesoureiro, t.id, "Erro de digitação");
    expect(await saldoDe(caixa.id)).toBe("120");
    expect(await saldoDe(banco.id)).toBe("0");
  });

  it("lançamento cancelado não conta em nada", async () => {
    const e = await lanc({ valor: "70,00" });
    const p = await lanc({ valor: "5,00", realizado: false, dataVencimento: "23/10/2026" });
    await cancelarLancamento(tesoureiro, e.id, "Duplicado");
    await cancelarLancamento(tesoureiro, p.id, "Duplicado");
    expect(await saldoDe(caixa.id)).toBe("100");
    const r = await resumoMes(pastor, 2026, 10);
    expect(r.entradas.toString()).toBe("0");
    expect(r.porCategoriaEntrada).toEqual([]);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-24T15:00:00Z"));
      const a = await alertas(pastor);
      expect(a.vencidos).toEqual([]);
      expect(a.proximos).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ordena por nome, oculta inativa zerada e mostra inativa com saldo", async () => {
    const zerada = await criarConta(admin, { nome: "Antiga", tipo: "BANCO", saldoInicial: "0" });
    await definirContaAtiva(admin, zerada.id, false);
    expect((await saldoPorConta(pastor)).map((s) => s.nome)).toEqual(["Banco", "Caixa"]);

    await lanc({ contaId: banco.id, valor: "10,00" });
    await definirContaAtiva(admin, banco.id, false);
    const r = await saldoPorConta(pastor);
    expect(r.map((s) => [s.nome, s.tipo, s.saldo.toString()])).toEqual([
      ["Banco", "BANCO", "10"],
      ["Caixa", "CAIXA", "100"],
    ]);
  });

  it("exige financeiro.ver", async () => {
    await expect(saldoPorConta(eventos)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(saldoTotal(null)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("resumoMes", () => {
  it("soma realizados do mês por tipo e por categoria, ordenado por total desc", async () => {
    await lanc({ valor: "50,00" });
    await lanc({ valor: "200,00", categoriaId: doacao.id });
    await lanc({ valor: "25,00" });
    await saida({ valor: "30,00" });
    await saida({ valor: "40,00", categoriaId: luz.id });
    await lanc({ valor: "999,00", realizado: false }); // previsto: fora
    await lanc({ valor: "7,00", dataVencimento: "30/09/2026" }); // outro mês

    const r = await resumoMes(pastor, 2026, 10);
    expect(r.entradas.toString()).toBe("275");
    expect(r.saidas.toString()).toBe("70");
    expect(r.resultado.toString()).toBe("205");
    expect(r.porCategoriaEntrada.map((c) => [c.categoria, c.total.toString()])).toEqual([
      ["Doação", "200"],
      ["Oferta", "75"],
    ]);
    expect(r.porCategoriaSaida.map((c) => [c.categoria, c.total.toString()])).toEqual([
      ["Luz", "40"],
      ["Água", "30"],
    ]);
  });

  it("empate de total desempata pelo nome", async () => {
    const zeta = await criarCategoria(admin, { nome: "Zeta", tipo: "ENTRADA", nominal: false });
    await lanc({ valor: "10,00", categoriaId: zeta.id });
    await lanc({ valor: "10,00", categoriaId: oferta.id });
    const r = await resumoMes(pastor, 2026, 10);
    expect(r.porCategoriaEntrada.map((c) => c.categoria)).toEqual(["Oferta", "Zeta"]);
  });

  it("usa a data de realização, não a de vencimento", async () => {
    const p = await lanc({ valor: "80,00", realizado: false, dataVencimento: "20/09/2026" });
    await darBaixa(tesoureiro, p.id, "05/10/2026");
    expect((await resumoMes(pastor, 2026, 9)).entradas.toString()).toBe("0");
    expect((await resumoMes(pastor, 2026, 10)).entradas.toString()).toBe("80");
  });

  it("Review Focus 2: realizado em 31/10/2026 entra em outubro e não em novembro (TZ=UTC)", async () => {
    // O dia de hoje real (27/10/2026) vem antes de 31/10: recusaria a data futura.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T15:00:00Z"));
    expect(process.env.TZ).toBe("UTC");
    await lanc({ valor: "50,00", dataVencimento: "31/10/2026", dataRealizacao: "31/10/2026" });
    expect((await resumoMes(pastor, 2026, 10)).entradas.toString()).toBe("50");
    expect((await resumoMes(pastor, 2026, 11)).entradas.toString()).toBe("0");
  });

  it("mês sem movimento retorna zeros e listas vazias", async () => {
    const r = await resumoMes(pastor, 2026, 1);
    expect(r.entradas.toString()).toBe("0");
    expect(r.saidas.toString()).toBe("0");
    expect(r.resultado.toString()).toBe("0");
    expect(r.porCategoriaEntrada).toEqual([]);
    expect(r.porCategoriaSaida).toEqual([]);
  });

  it("valida ano e mês e exige financeiro.ver", async () => {
    for (const [a, m] of [
      [2026, 0],
      [2026, 13],
      [2026, 1.5],
      [1999, 1],
      [2101, 1],
      [2026.5, 1],
    ]) {
      await expect(resumoMes(pastor, a, m)).rejects.toBeInstanceOf(Validacao);
    }
    await expect(resumoMes(pastor, 2026, 13)).rejects.toThrow("Mês inválido");
    await expect(resumoMes(eventos, 2026, 10)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("alertas", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h em São Paulo, 24/10/2026.
    vi.setSystemTime(new Date("2026-10-24T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const prevista = (venc: string, o: Partial<DadosLancamento> = {}) =>
    lanc({ realizado: false, dataVencimento: venc, ...o });

  it("vencido ontem em vencidos; hoje e +7 em próximos; +8 em nenhum", async () => {
    const ontem = await prevista("23/10/2026", { descricao: "Atrasada", valor: "12,34" });
    const hoje = await prevista("24/10/2026");
    const mais7 = await saida({ realizado: false, dataVencimento: "31/10/2026" });
    await prevista("01/11/2026"); // +8
    await lanc({ dataVencimento: "20/10/2026" }); // realizado: não é alerta

    const a = await alertas(pastor);
    expect(a.vencidos).toHaveLength(1);
    expect(a.vencidos[0]).toMatchObject({
      id: ontem.id,
      tipo: "ENTRADA",
      descricao: "Atrasada",
      categoria: "Oferta",
    });
    expect(a.vencidos[0].valor.toString()).toBe("12.34");
    expect(a.vencidos[0].dataVencimento.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(a.proximos.map((i) => i.id)).toEqual([hoje.id, mais7.id]);
    expect(a.proximos[1]).toMatchObject({ tipo: "SAIDA", categoria: "Água", descricao: null });
  });

  it("ordena por vencimento crescente", async () => {
    const b = await prevista("20/10/2026");
    const a = await prevista("01/10/2026");
    const d = await prevista("30/10/2026");
    const c = await prevista("25/10/2026");
    const r = await alertas(pastor);
    expect(r.vencidos.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(r.proximos.map((i) => i.id)).toEqual([c.id, d.id]);
  });

  it("usa o dia de São Paulo: 01h UTC de 25/10 ainda é 24/10", async () => {
    vi.setSystemTime(new Date("2026-10-25T01:00:00Z"));
    const l = await prevista("24/10/2026");
    const r = await alertas(pastor);
    expect(r.vencidos).toEqual([]);
    expect(r.proximos.map((i) => i.id)).toEqual([l.id]);
  });

  it("exige financeiro.ver", async () => {
    await expect(alertas(eventos)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});
