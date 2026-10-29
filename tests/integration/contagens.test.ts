import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Conta } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import {
  DENOMINACOES,
  calcularTotal,
  listarContagens,
  obterContagem,
  registrarContagem,
  valorEsperado,
} from "@/lib/services/contagens";
import { saldoDaConta, saldoPorConta } from "@/lib/services/resumo";
import { cancelarLancamento, criarLancamento, darBaixa, type DadosLancamento } from "@/lib/services/lancamentos";
import { criarTransferencia } from "@/lib/services/transferencias";
import { criarConta, definirContaAtiva } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { hojeSP } from "@/lib/datas";
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
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let banco: Conta;
let oferta: Categoria;
let agua: Categoria;

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
  agua = await prisma.categoria.findFirstOrThrow({ where: { nome: "Água", tipo: "SAIDA" } });
});

const lanc = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "100,00",
  categoriaId: oferta.id,
  contaId: caixa.id,
  dataVencimento: "10/03/2026",
  realizado: true,
  dataRealizacao: "10/03/2026",
  ...o,
});

const dataISO = (d: Date) => d.toISOString().slice(0, 10);

const falha = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  return e as Validacao;
};

describe("DENOMINACOES", () => {
  it("cédulas de 200 a 2 e moedas de 1,00 a 0,01, em ordem decrescente", () => {
    expect(DENOMINACOES.map((d) => d.centavos)).toEqual([20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1]);
    expect(DENOMINACOES.filter((d) => d.tipo === "cedula")).toHaveLength(7);
    expect(DENOMINACOES.find((d) => d.centavos === 20000)?.rotulo).toBe("R$ 200,00");
    expect(DENOMINACOES.find((d) => d.centavos === 25)?.rotulo).toBe("R$ 0,25");
  });
});

describe("calcularTotal", () => {
  it("soma quantidade × denominação sem perder centavos", () => {
    const t = calcularTotal([
      { denominacaoCentavos: 10000, quantidade: 2 },
      { denominacaoCentavos: 50, quantidade: 3 },
      { denominacaoCentavos: 1, quantidade: 7 },
      { denominacaoCentavos: 500, quantidade: 0 },
    ]);
    expect(t.toFixed(2)).toBe("201.57");
    expect(calcularTotal([]).toFixed(2)).toBe("0.00");
  });

  it("quantidade negativa, fracionária ou acima do limite → Validacao", () => {
    expect(() => calcularTotal([{ denominacaoCentavos: 100, quantidade: -1 }])).toThrow(Validacao);
    expect(() => calcularTotal([{ denominacaoCentavos: 100, quantidade: 1.5 }])).toThrow(Validacao);
    expect(() => calcularTotal([{ denominacaoCentavos: 100, quantidade: 100001 }])).toThrow(Validacao);
    expect(() => calcularTotal([{ denominacaoCentavos: 100, quantidade: Number.NaN }])).toThrow(Validacao);
    expect(calcularTotal([{ denominacaoCentavos: 100, quantidade: 100000 }]).toFixed(2)).toBe("100000.00");
  });

  it("denominação fora da lista ou repetida → Validacao", () => {
    expect(() => calcularTotal([{ denominacaoCentavos: 300, quantidade: 1 }])).toThrow(Validacao);
    expect(() =>
      calcularTotal([
        { denominacaoCentavos: 100, quantidade: 1 },
        { denominacaoCentavos: 100, quantidade: 2 },
      ]),
    ).toThrow(Validacao);
  });
});

describe("saldoDaConta", () => {
  it("é igual ao saldo de saldoPorConta", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "50,00" }));
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: agua.id, valor: "20,00" }));
    await criarLancamento(tesoureiro, lanc({ realizado: false, dataRealizacao: undefined, valor: "999,00" }));
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "30,00", data: "11/03/2026" });
    const saldos = await saldoPorConta(admin);
    for (const c of [caixa, banco]) {
      const esperado = saldos.find((s) => s.contaId === c.id)!.saldo;
      expect((await saldoDaConta(prisma, c.id)).toFixed(2)).toBe(esperado.toFixed(2));
    }
    expect((await saldoDaConta(prisma, caixa.id)).toFixed(2)).toBe("100.00");
  });
});

describe("valorEsperado", () => {
  it("CULTO soma só entradas realizadas do dia e da conta", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "100,00" }));
    await criarLancamento(tesoureiro, lanc({ valor: "25,50" }));
    // ignorados
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: agua.id, valor: "10,00" }));
    await criarLancamento(tesoureiro, lanc({ realizado: false, dataRealizacao: undefined, valor: "7,00" }));
    const cancelado = await criarLancamento(tesoureiro, lanc({ valor: "8,00" }));
    await cancelarLancamento(tesoureiro, cancelado.id, "erro");
    await criarLancamento(tesoureiro, lanc({ contaId: banco.id, valor: "9,00" }));
    await criarLancamento(tesoureiro, lanc({ dataRealizacao: "11/03/2026", valor: "11,00" }));
    // previsto de outro dia baixado no dia conta
    const baixado = await criarLancamento(tesoureiro, lanc({ realizado: false, dataRealizacao: undefined, dataVencimento: "01/03/2026", valor: "1,00" }));
    await darBaixa(tesoureiro, baixado.id, "10/03/2026");

    const v = await valorEsperado(pastor, { modo: "CULTO", contaId: caixa.id, data: "10/03/2026" });
    expect(v.toFixed(2)).toBe("126.50");
  });

  it("CULTO sem data usa hoje", async () => {
    const hoje = hojeSP();
    const dd = `${String(hoje.getUTCDate()).padStart(2, "0")}/${String(hoje.getUTCMonth() + 1).padStart(2, "0")}/${hoje.getUTCFullYear()}`;
    await criarLancamento(tesoureiro, lanc({ dataVencimento: dd, dataRealizacao: dd, valor: "42,00" }));
    expect((await valorEsperado(tesoureiro, { modo: "CULTO", contaId: caixa.id })).toFixed(2)).toBe("42.00");
  });

  it("CAIXA = saldo atual da conta (igual a saldoPorConta)", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "50,00" }));
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: agua.id, valor: "20,00" }));
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "30,00", data: "11/03/2026" });
    const saldo = (await saldoPorConta(admin)).find((s) => s.contaId === caixa.id)!.saldo;
    const v = await valorEsperado(tesoureiro, { modo: "CAIXA", contaId: caixa.id });
    expect(v.toFixed(2)).toBe(saldo.toFixed(2));
    expect(v.toFixed(2)).toBe("100.00");
  });

  it("exige financeiro.ver e valida modo/data", async () => {
    await expect(valorEsperado(eventos, { modo: "CAIXA", contaId: caixa.id })).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(valorEsperado(null, { modo: "CAIXA", contaId: caixa.id })).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(valorEsperado(tesoureiro, { modo: "XX" as never, contaId: caixa.id })).rejects.toBeInstanceOf(Validacao);
    const e = await falha(valorEsperado(tesoureiro, { modo: "CULTO", contaId: caixa.id, data: "01/01/2099" }));
    expect(e).toBeInstanceOf(Validacao);
    expect({ campo: e.campo, regra: e.regra }).toEqual({ campo: "data", regra: "futura" });
    await expect(valorEsperado(tesoureiro, { modo: "CAIXA", contaId: "nao-existe" })).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("registrarContagem", () => {
  const itensDe = (pares: [number, number][]) => pares.map(([denominacaoCentavos, quantidade]) => ({ denominacaoCentavos, quantidade }));

  it("contagem que bate dispensa observação; grava itens > 0, log e métrica", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "125,50" }));
    const c = await registrarContagem(tesoureiro, {
      modo: "CULTO",
      contaId: caixa.id,
      data: "10/03/2026",
      itens: itensDe([
        [10000, 1],
        [2000, 1],
        [500, 1],
        [50, 1],
        [200, 0],
      ]),
    });
    expect(c.totalContado.toFixed(2)).toBe("125.50");
    expect(c.esperado.toFixed(2)).toBe("125.50");
    expect(c.diferenca.toFixed(2)).toBe("0.00");
    expect(c.observacao).toBeNull();
    expect(c.modo).toBe("CULTO");
    expect(dataISO(c.data)).toBe("2026-03-10");
    expect(c.criadoPorId).toBe(tesoureiro.id);

    const itens = await prisma.contagemItem.findMany({ where: { contagemId: c.id }, orderBy: { denominacaoCentavos: "desc" } });
    expect(itens.map((i) => [i.denominacaoCentavos, i.quantidade])).toEqual([
      [10000, 1],
      [2000, 1],
      [500, 1],
      [50, 1],
    ]);

    const logs = await prisma.log.findMany({ where: { entidadeId: c.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      acao: "REGISTROU_CONTAGEM",
      entidade: "Contagem",
      usuarioId: tesoureiro.id,
      valorNovo: "Contado R$ 125,50 · Esperado R$ 125,50 · Diferença R$ 0,00",
    });

    const ev = await prisma.eventoUso.findFirstOrThrow({ where: { evento: "contagem_registrada" } });
    expect(ev.propriedades).toEqual({ modo: "CULTO", divergente: false });
  });

  it("divergente sem observação → Validacao; com observação grava diferença negativa", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "130,00" }));
    const dados = { modo: "CULTO" as const, contaId: caixa.id, data: "10/03/2026", itens: itensDe([[10000, 1]]) };
    const e = await falha(registrarContagem(tesoureiro, dados));
    expect(e).toBeInstanceOf(Validacao);
    expect({ campo: e.campo, regra: e.regra }).toEqual({ campo: "observacao", regra: "obrigatorio_divergencia" });
    expect(await falha(registrarContagem(tesoureiro, { ...dados, observacao: "   " }))).toBeInstanceOf(Validacao);
    expect(await prisma.contagemCaixa.count()).toBe(0);
    expect(await prisma.log.count({ where: { entidade: "Contagem" } })).toBe(0);

    const c = await registrarContagem(tesoureiro, { ...dados, observacao: " R$ 30 de troco devolvido " });
    expect(c.diferenca.toFixed(2)).toBe("-30.00");
    expect(c.observacao).toBe("R$ 30 de troco devolvido");
    const lg = await prisma.log.findFirstOrThrow({ where: { entidadeId: c.id } });
    expect(lg.valorNovo).toBe("Contado R$ 100,00 · Esperado R$ 130,00 · Diferença -R$ 30,00");
    const ev = await prisma.eventoUso.findFirstOrThrow({ where: { evento: "contagem_registrada" } });
    expect(ev.propriedades).toEqual({ modo: "CULTO", divergente: true });
  });

  it("CAIXA usa o saldo atual e grava a data de hoje", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "50,00" }));
    const c = await registrarContagem(tesoureiro, {
      modo: "CAIXA",
      contaId: caixa.id,
      itens: itensDe([
        [10000, 1],
        [5000, 1],
      ]),
    });
    expect(c.esperado.toFixed(2)).toBe("150.00");
    expect(c.diferenca.toFixed(2)).toBe("0.00");
    expect(dataISO(c.data)).toBe(dataISO(hojeSP()));
  });

  it("Pastor e Eventos → NaoAutorizado", async () => {
    const d = { modo: "CAIXA" as const, contaId: caixa.id, itens: itensDe([[10000, 1]]) };
    await expect(registrarContagem(pastor, d)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(registrarContagem(eventos, d)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(registrarContagem(null, d)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("esperado gravado não muda após novo lançamento", async () => {
    const c = await registrarContagem(tesoureiro, { modo: "CAIXA", contaId: caixa.id, itens: itensDe([[10000, 1]]) });
    await criarLancamento(tesoureiro, lanc({ valor: "500,00" }));
    const depois = await obterContagem(pastor, c.id);
    expect(depois.esperado.toFixed(2)).toBe("100.00");
    expect(depois.diferenca.toFixed(2)).toBe("0.00");
  });

  it("valida quantidades, itens, data e conta", async () => {
    const d = { modo: "CULTO" as const, contaId: caixa.id, data: "10/03/2026" };
    expect(await falha(registrarContagem(tesoureiro, { ...d, itens: itensDe([[100, -1]]) }))).toBeInstanceOf(Validacao);
    expect(await falha(registrarContagem(tesoureiro, { ...d, itens: itensDe([[100, 2.5]]) }))).toBeInstanceOf(Validacao);
    expect(await falha(registrarContagem(tesoureiro, { ...d, itens: itensDe([[300, 1]]) }))).toBeInstanceOf(Validacao);
    const vazio = await falha(registrarContagem(tesoureiro, { ...d, itens: itensDe([[100, 0]]) }));
    expect(vazio).toBeInstanceOf(Validacao);
    expect(vazio.message).toBe("Informe ao menos uma quantidade");
    expect(await falha(registrarContagem(tesoureiro, { ...d, itens: [] }))).toBeInstanceOf(Validacao);
    const futura = await falha(registrarContagem(tesoureiro, { ...d, data: "01/01/2099", itens: itensDe([[100, 1]]) }));
    expect({ campo: futura.campo, regra: futura.regra }).toEqual({ campo: "data", regra: "futura" });
    expect(await falha(registrarContagem(tesoureiro, { ...d, data: "31/02/2026", itens: itensDe([[100, 1]]) }))).toBeInstanceOf(Validacao);
    await expect(registrarContagem(tesoureiro, { ...d, contaId: "nao-existe", itens: itensDe([[100, 1]]) })).rejects.toBeInstanceOf(NaoEncontrado);
    await definirContaAtiva(admin, banco.id, false);
    await expect(
      registrarContagem(tesoureiro, { ...d, contaId: banco.id, observacao: "x", itens: itensDe([[100, 1]]) }),
    ).rejects.toBeInstanceOf(RegraDeNegocio);
    expect(await prisma.contagemCaixa.count()).toBe(0);
  });
});

describe("listarContagens e obterContagem", () => {
  it("lista 20 por página, mais recente primeiro, com nomes e data só no CULTO", async () => {
    const um = await registrarContagem(tesoureiro, {
      modo: "CULTO",
      contaId: caixa.id,
      data: "10/03/2026",
      observacao: "sobra",
      itens: [{ denominacaoCentavos: 200, quantidade: 1 }],
    });
    for (let i = 0; i < 20; i++) {
      await registrarContagem(tesoureiro, { modo: "CAIXA", contaId: caixa.id, observacao: "x", itens: [{ denominacaoCentavos: 1, quantidade: i + 1 }] });
    }
    const p1 = await listarContagens(pastor, {});
    expect(p1.total).toBe(21);
    expect(p1.itens).toHaveLength(20);
    expect(p1.itens[0]).toMatchObject({ modo: "CAIXA", conta: "Caixa", criadoPor: "tes", data: null });
    expect(p1.itens[0].totalContado.toFixed(2)).toBe("0.20");
    const p2 = await listarContagens(pastor, { pagina: 2 });
    expect(p2.itens).toHaveLength(1);
    expect(p2.itens[0]).toMatchObject({ id: um.id, modo: "CULTO", data: "10/03/2026", conta: "Caixa", criadoPor: "tes" });
    expect(p2.itens[0].esperado.toFixed(2)).toBe("0.00");
    expect(p2.itens[0].diferenca.toFixed(2)).toBe("2.00");
  });

  it("filtra por conta e período", async () => {
    await registrarContagem(tesoureiro, { modo: "CULTO", contaId: caixa.id, data: "10/03/2026", observacao: "x", itens: [{ denominacaoCentavos: 100, quantidade: 1 }] });
    await registrarContagem(tesoureiro, { modo: "CULTO", contaId: banco.id, data: "15/03/2026", observacao: "x", itens: [{ denominacaoCentavos: 100, quantidade: 1 }] });
    expect((await listarContagens(tesoureiro, { contaId: banco.id })).total).toBe(1);
    expect((await listarContagens(tesoureiro, { de: "11/03/2026" })).itens.map((c) => c.data)).toEqual(["15/03/2026"]);
    expect((await listarContagens(tesoureiro, { ate: "10/03/2026" })).itens.map((c) => c.data)).toEqual(["10/03/2026"]);
    await expect(listarContagens(tesoureiro, { de: "xx" })).rejects.toBeInstanceOf(Validacao);
    await expect(listarContagens(tesoureiro, { pagina: 0 })).rejects.toBeInstanceOf(Validacao);
  });

  it("obterContagem traz itens por denominação decrescente com rótulo", async () => {
    const c = await registrarContagem(tesoureiro, {
      modo: "CULTO",
      contaId: caixa.id,
      data: "10/03/2026",
      observacao: "sobra",
      itens: [
        { denominacaoCentavos: 5, quantidade: 3 },
        { denominacaoCentavos: 5000, quantidade: 2 },
      ],
    });
    const d = await obterContagem(pastor, c.id);
    expect(d).toMatchObject({ id: c.id, modo: "CULTO", conta: "Caixa", contaId: caixa.id, criadoPor: "tes", data: "10/03/2026", observacao: "sobra" });
    expect(d.totalContado.toFixed(2)).toBe("100.15");
    expect(d.itens.map((i) => [i.denominacaoCentavos, i.quantidade, i.rotulo, i.subtotal.toFixed(2)])).toEqual([
      [5000, 2, "R$ 50,00", "100.00"],
      [5, 3, "R$ 0,05", "0.15"],
    ]);
    await expect(obterContagem(pastor, "nao-existe")).rejects.toThrow("Contagem não encontrada");
    await expect(obterContagem(pastor, "nao-existe")).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(obterContagem(eventos, c.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(listarContagens(eventos, {})).rejects.toBeInstanceOf(NaoAutorizado);
  });
});
