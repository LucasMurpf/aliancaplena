import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, Validacao } from "@/lib/erros";
import { historicoDe } from "@/lib/services/historico";
import { instalar } from "@/lib/services/instalacao";
import { atualizarBem, criarBem, listarBens, obterBem } from "@/lib/services/patrimonio";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let responsavel: UsuarioAtual;

const SOM = { descricao: "Caixa de som", valor: "1.200,50", local: "Templo" };
const falha = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("devia ter falhado");
    },
    (e: Error & { campo?: string; regra?: string }) => e,
  );

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
  const mk = (nome: string, papeis: ("PASTOR" | "TESOUREIRO" | "PATRIMONIO")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  pastor = await mk("pastor", ["PASTOR"]);
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  responsavel = await mk("resp", ["PATRIMONIO"]);
});

describe("patrimônio", () => {
  it("cadastra um bem e registra no histórico", async () => {
    const b = await criarBem(responsavel, { ...SOM, descricao: "  Caixa de som " });
    expect(b.descricao).toBe("Caixa de som");
    expect(b.valor.toFixed(2)).toBe("1200.50");
    expect(b.local).toBe("Templo");
    const logs = await prisma.log.findMany({ where: { entidade: "Bem", entidadeId: b.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ acao: "CRIOU", usuarioId: responsavel.id, valorNovo: "Caixa de som · R$ 1.200,50 · Templo" });
  });

  it("lista em ordem de descrição com o valor total", async () => {
    await criarBem(admin, SOM);
    await criarBem(admin, { descricao: "Bancos", valor: "300,00", local: "Salão" });
    const { itens, valorTotal } = await listarBens(pastor);
    expect(itens.map((b) => b.descricao)).toEqual(["Bancos", "Caixa de som"]);
    expect(valorTotal.toFixed(2)).toBe("1500.50");
  });

  it("altera e loga só o que mudou, com o rótulo legível", async () => {
    const b = await criarBem(admin, SOM);
    await atualizarBem(responsavel, b.id, { ...SOM, valor: "1.000,00", local: "Salão" });
    const atual = await obterBem(admin, b.id);
    expect(atual.valor.toFixed(2)).toBe("1000.00");
    const alteracoes = await prisma.log.findMany({ where: { entidadeId: b.id, acao: "ALTEROU" }, orderBy: { campo: "asc" } });
    expect(alteracoes.map((l) => [l.campo, l.valorAnterior, l.valorNovo])).toEqual([
      ["local", "Templo", "Salão"],
      ["valor", "R$ 1.200,50", "R$ 1.000,00"],
    ]);
    const historico = await historicoDe(responsavel, "Bem", b.id);
    expect(historico.map((h) => h.campo)).toContain("Local");
  });

  it("valor zero é aceito (bem doado); vazio ou inválido não", async () => {
    expect((await criarBem(admin, { ...SOM, valor: "0" })).valor.toFixed(2)).toBe("0.00");
    const vazio = await falha(criarBem(admin, { ...SOM, valor: "" }));
    expect(vazio).toBeInstanceOf(Validacao);
    expect({ campo: vazio.campo, regra: vazio.regra }).toEqual({ campo: "valor", regra: "obrigatorio" });
    const invalido = await falha(criarBem(admin, { ...SOM, valor: "abc" }));
    expect(invalido.campo).toBe("valor");
    expect((await falha(criarBem(admin, { ...SOM, descricao: "  " }))).campo).toBe("descricao");
    expect((await falha(criarBem(admin, { ...SOM, local: "" }))).campo).toBe("local");
    expect(await prisma.bem.count()).toBe(1);
  });

  it("permissões: pastor só vê; tesoureiro sem o papel não acessa; sem sessão não acessa", async () => {
    const b = await criarBem(admin, SOM);
    expect((await obterBem(pastor, b.id)).id).toBe(b.id);
    expect(await falha(criarBem(pastor, SOM))).toBeInstanceOf(NaoAutorizado);
    expect(await falha(atualizarBem(pastor, b.id, SOM))).toBeInstanceOf(NaoAutorizado);
    expect(await falha(listarBens(tesoureiro))).toBeInstanceOf(NaoAutorizado);
    expect(await falha(criarBem(tesoureiro, SOM))).toBeInstanceOf(NaoAutorizado);
    expect(await falha(listarBens(null))).toBeInstanceOf(NaoAutorizado);
  });

  it("responsável pelo patrimônio não vê o financeiro", async () => {
    const { listarContas } = await import("@/lib/services/cadastros");
    expect(await falha(listarContas(responsavel))).toBeInstanceOf(NaoAutorizado);
  });

  it("bem inexistente", async () => {
    expect(await falha(obterBem(admin, "nao-existe"))).toBeInstanceOf(NaoEncontrado);
    expect(await falha(atualizarBem(admin, "nao-existe", SOM))).toBeInstanceOf(NaoEncontrado);
  });
});
