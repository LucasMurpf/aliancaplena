import { beforeEach, describe, expect, it } from "vitest";
import { Dispositivo } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, Validacao } from "@/lib/erros";
import { atualizarConfiguracao, obterConfiguracaoAdmin } from "@/lib/services/configuracao";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { registrarEventos } from "@/lib/services/metricas";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;

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
  const t = await criarUsuario(admin, {
    nome: "Tes",
    email: "tes@igreja.org",
    senha: "senha-forte-123",
    papeis: ["TESOUREIRO"],
  });
  tesoureiro = { id: t.id, nome: t.nome, email: t.email, papeis: ["TESOUREIRO"] };
});

const configId = async () => (await prisma.configuracao.findFirstOrThrow()).id;

describe("atualizarConfiguracao", () => {
  it("tesoureiro não altera a configuração", async () => {
    await expect(atualizarConfiguracao(tesoureiro, { nomeIgreja: "Outra" })).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(obterConfiguracaoAdmin(tesoureiro)).rejects.toBeInstanceOf(NaoAutorizado);
    expect((await prisma.configuracao.findFirstOrThrow()).nomeIgreja).toBe("Igreja");
  });

  it("admin altera o nome e isso gera um único log ALTEROU", async () => {
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja Nova" });
    expect((await prisma.configuracao.findFirstOrThrow()).nomeIgreja).toBe("Igreja Nova");
    const logs = await prisma.log.findMany({ where: { entidade: "Configuracao", entidadeId: await configId(), acao: "ALTEROU" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      acao: "ALTEROU",
      campo: "nomeIgreja",
      valorAnterior: "Igreja",
      valorNovo: "Igreja Nova",
      usuarioId: admin.id,
    });
  });

  it("nome vazio é Validacao", async () => {
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "   " })).rejects.toBeInstanceOf(Validacao);
  });

  it("logo só aceita http(s) ou vazio", async () => {
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "Igreja", logoUrl: "javascript:alert(1)" })).rejects.toBeInstanceOf(Validacao);
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "Igreja", logoUrl: "ftp://x.org/a.png" })).rejects.toBeInstanceOf(Validacao);
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", logoUrl: "https://x.org/logo.png" });
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", logoUrl: "" });
    expect((await prisma.configuracao.findFirstOrThrow()).logoUrl).toBeNull();
  });

  it("CNPJ com até 18 caracteres", async () => {
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "Igreja", cnpj: "x".repeat(19) })).rejects.toBeInstanceOf(Validacao);
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", cnpj: "12.345.678/0001-90" });
    expect((await obterConfiguracaoAdmin(admin)).cnpj).toBe("12.345.678/0001-90");
  });

  it("cidade: até 80 caracteres, vazia vira nulo, muda com log", async () => {
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "Igreja", cidade: "x".repeat(81) })).rejects.toBeInstanceOf(Validacao);
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", cidade: "  Colombo  " });
    expect((await obterConfiguracaoAdmin(admin)).cidade).toBe("Colombo");
    const logs = await prisma.log.findMany({ where: { entidade: "Configuracao", campo: "cidade" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ acao: "ALTEROU", valorNovo: "Colombo", usuarioId: admin.id });
    // omitir não apaga; vazio apaga
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja" });
    expect((await obterConfiguracaoAdmin(admin)).cidade).toBe("Colombo");
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", cidade: "" });
    expect((await obterConfiguracaoAdmin(admin)).cidade).toBeNull();
    expect(await prisma.log.count({ where: { entidade: "Configuracao", campo: "cidade" } })).toBe(2);
  });

  it("desligar métricas grava o log em Sim/Não e impede novos eventos", async () => {
    await atualizarConfiguracao(admin, { nomeIgreja: "Igreja", metricasAtivas: false });
    const log = await prisma.log.findFirstOrThrow({ where: { entidade: "Configuracao", acao: "ALTEROU", campo: "metricasAtivas" } });
    expect(log).toMatchObject({ acao: "ALTEROU", valorAnterior: "Sim", valorNovo: "Não" });

    const gravados = await registrarEventos(admin, [{ nome: "login", tela: "/", dispositivo: Dispositivo.PC }]);
    expect(gravados).toBe(0);
    expect(await prisma.eventoUso.count()).toBe(0);
  });

  it("configuração inexistente é NaoEncontrado", async () => {
    await prisma.configuracao.deleteMany();
    await expect(atualizarConfiguracao(admin, { nomeIgreja: "X" })).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
