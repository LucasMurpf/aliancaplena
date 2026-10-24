import { beforeEach, describe, expect, it } from "vitest";
import type { Conta } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import {
  cancelarTransferencia,
  criarTransferencia,
  listarTransferencias,
  obterTransferencia,
} from "@/lib/services/transferencias";
import { criarConta, definirContaAtiva } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let caixa: Conta;
let banco: Conta;

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "0",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  const mk = (nome: string, papeis: ("PASTOR" | "TESOUREIRO")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  pastor = await mk("pastor", ["PASTOR"]);
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0" });
});

const dados = (o: Record<string, unknown> = {}) => ({
  contaOrigemId: caixa.id,
  contaDestinoId: banco.id,
  valor: "20,00",
  data: "31/10/2026",
  ...o,
});
const logs = (entidadeId: string) =>
  prisma.log.findMany({ where: { entidadeId }, orderBy: [{ dataHora: "asc" }, { id: "asc" }] });

describe("criarTransferencia", () => {
  it("cria e registra o log legível", async () => {
    const t = await criarTransferencia(tesoureiro, dados({ descricao: " Depósito " }));
    expect(t.status).toBe("ATIVA");
    expect(t.valor.toString()).toBe("20");
    expect(t.descricao).toBe("Depósito");
    expect(t.criadoPorId).toBe(tesoureiro.id);
    const [l] = await logs(t.id);
    expect(l).toMatchObject({ entidade: "Transferencia", acao: "CRIOU", campo: null });
    expect(l.valorNovo).toBe("R$ 20,00 de Caixa para Banco em 31/10/2026");
  });

  it("recusa mesma conta", async () => {
    const p = criarTransferencia(tesoureiro, dados({ contaDestinoId: caixa.id }));
    await expect(p).rejects.toBeInstanceOf(RegraDeNegocio);
    await expect(p).rejects.toThrow("Escolha contas diferentes");
  });

  it("recusa conta inativa (origem ou destino)", async () => {
    await definirContaAtiva(admin, banco.id, false);
    await expect(criarTransferencia(tesoureiro, dados())).rejects.toThrow("Conta inativa");
    await expect(
      criarTransferencia(tesoureiro, dados({ contaOrigemId: banco.id, contaDestinoId: caixa.id })),
    ).rejects.toThrow("Conta inativa");
    expect(await prisma.transferencia.count()).toBe(0);
  });

  it("recusa conta inexistente, valor e data inválidos", async () => {
    await expect(criarTransferencia(tesoureiro, dados({ contaDestinoId: "x" }))).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(criarTransferencia(tesoureiro, dados({ valor: "0" }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarTransferencia(tesoureiro, dados({ valor: "abc" }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarTransferencia(tesoureiro, dados({ data: "32/13/2026" }))).rejects.toBeInstanceOf(Validacao);
  });

  it("Pastor e anônimo não criam", async () => {
    await expect(criarTransferencia(pastor, dados())).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(criarTransferencia(null, dados())).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("cancelarTransferencia", () => {
  it("cancela com motivo e registra log", async () => {
    const t = await criarTransferencia(tesoureiro, dados());
    const c = await cancelarTransferencia(tesoureiro, t.id, "  Erro de digitação ");
    expect(c.status).toBe("CANCELADA");
    expect(c.motivoCancelamento).toBe("Erro de digitação");
    const ls = await logs(t.id);
    expect(ls[1]).toMatchObject({
      acao: "CANCELOU",
      campo: "status",
      valorAnterior: "ATIVA",
      valorNovo: "Erro de digitação",
    });
  });

  it("exige motivo", async () => {
    const t = await criarTransferencia(tesoureiro, dados());
    await expect(cancelarTransferencia(tesoureiro, t.id, "  ")).rejects.toThrow("Informe o motivo do cancelamento");
  });

  it("recusa cancelar duas vezes (inclusive em paralelo)", async () => {
    const t = await criarTransferencia(tesoureiro, dados());
    await cancelarTransferencia(tesoureiro, t.id, "x");
    await expect(cancelarTransferencia(tesoureiro, t.id, "y")).rejects.toBeInstanceOf(RegraDeNegocio);

    const t2 = await criarTransferencia(tesoureiro, dados());
    const r = await Promise.allSettled([
      cancelarTransferencia(tesoureiro, t2.id, "a"),
      cancelarTransferencia(tesoureiro, t2.id, "b"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await logs(t2.id)).filter((l) => l.acao === "CANCELOU")).toHaveLength(1);
  });

  it("não encontrada e Pastor", async () => {
    await expect(cancelarTransferencia(tesoureiro, "nada", "x")).rejects.toThrow("Transferência não encontrada");
    const t = await criarTransferencia(tesoureiro, dados());
    await expect(cancelarTransferencia(pastor, t.id, "x")).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("leitura", () => {
  it("obter inclui nomes das contas; Pastor pode ler", async () => {
    const t = await criarTransferencia(tesoureiro, dados());
    const o = await obterTransferencia(pastor, t.id);
    expect(o.contaOrigem.nome).toBe("Caixa");
    expect(o.contaDestino.nome).toBe("Banco");
    await expect(obterTransferencia(pastor, "nada")).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(obterTransferencia(null, t.id)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("lista filtrando por período inclusivo, conta e canceladas", async () => {
    const outra = await criarConta(admin, { nome: "Reserva", tipo: "BANCO", saldoInicial: "0" });
    const a = await criarTransferencia(tesoureiro, dados({ data: "01/10/2026" }));
    const b = await criarTransferencia(tesoureiro, dados({ data: "15/10/2026", contaOrigemId: banco.id, contaDestinoId: outra.id }));
    const c = await criarTransferencia(tesoureiro, dados({ data: "31/10/2026" }));
    const d = await criarTransferencia(tesoureiro, dados({ data: "31/10/2026" }));
    await cancelarTransferencia(tesoureiro, d.id, "x");

    const todas = await listarTransferencias(pastor, {});
    expect(todas.map((t) => t.id)).toEqual([c.id, b.id, a.id]);
    expect(todas[0].contaOrigem.nome).toBe("Caixa");

    const com = await listarTransferencias(pastor, { incluirCanceladas: true });
    expect(com.map((t) => t.id)).toEqual([d.id, c.id, b.id, a.id]);

    const faixa = await listarTransferencias(pastor, { de: "01/10/2026", ate: "15/10/2026" });
    expect(faixa.map((t) => t.id)).toEqual([b.id, a.id]);

    const porConta = await listarTransferencias(pastor, { contaId: outra.id });
    expect(porConta.map((t) => t.id)).toEqual([b.id]);
    const porDestino = await listarTransferencias(pastor, { contaId: banco.id });
    expect(porDestino.map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });
});
