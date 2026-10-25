import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/auth";
import { NaoAutorizado } from "@/lib/erros";
import { entrar } from "@/lib/services/autenticacao";
import { resetarBanco } from "../helpers/db";

const SENHA = "senha-certa-123";
let hash: string;

async function criarUsuario(email: string, ativo = true) {
  hash ??= await hashSenha(SENHA);
  return prisma.usuario.create({
    data: { nome: "Tesoureira", email, senhaHash: hash, ativo, papeis: { create: [{ papel: "TESOUREIRO" }] } },
  });
}

beforeEach(async () => {
  await resetarBanco();
});

describe("entrar", () => {
  it("login certo retorna o usuário e loga LOGIN", async () => {
    const u = await criarUsuario("tes@igreja.org");
    const atual = await entrar("tes@igreja.org", SENHA);
    expect(atual).toEqual({ id: u.id, nome: "Tesoureira", email: "tes@igreja.org", papeis: ["TESOUREIRO"] });

    const logs = await prisma.log.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ acao: "LOGIN", entidade: "Usuario", entidadeId: u.id, usuarioId: u.id });
  });

  it("e-mail com maiúsculas e espaços funciona", async () => {
    const u = await criarUsuario("tes@igreja.org");
    expect((await entrar("  TES@Igreja.Org  ", SENHA)).id).toBe(u.id);
  });

  it("senha errada → mensagem genérica e loga LOGIN_FALHOU sem usuário", async () => {
    await criarUsuario("tes@igreja.org");
    const p = entrar("Tes@igreja.org", "senha-errada");
    await expect(p).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(p).rejects.toThrow("E-mail ou senha inválidos");

    const logs = await prisma.log.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      acao: "LOGIN_FALHOU",
      entidade: "Login",
      entidadeId: "tes@igreja.org",
      usuarioId: null,
    });
  });

  it("usuário inativo → mesma mensagem genérica", async () => {
    await criarUsuario("antigo@igreja.org", false);
    await expect(entrar("antigo@igreja.org", SENHA)).rejects.toThrow("E-mail ou senha inválidos");
    expect(await prisma.log.count({ where: { acao: "LOGIN_FALHOU" } })).toBe(1);
  });

  it("usuário inexistente → mesma mensagem genérica", async () => {
    await expect(entrar("ninguem@igreja.org", SENHA)).rejects.toThrow("E-mail ou senha inválidos");
    expect(await prisma.log.count({ where: { acao: "LOGIN_FALHOU", entidadeId: "ninguem@igreja.org" } })).toBe(1);
  });

  it("e-mail com mais de 254 caracteres → falha genérica e o log guarda só 254", async () => {
    const enorme = `${"a".repeat(5000)}@igreja.org`;
    await expect(entrar(enorme, SENHA)).rejects.toThrow("E-mail ou senha inválidos");
    const log = await prisma.log.findFirstOrThrow({ where: { acao: "LOGIN_FALHOU" } });
    expect(log.entidadeId).toHaveLength(254);
    expect(log.entidadeId).toBe("a".repeat(254));

    // Um e-mail real de 254 caracteres continua funcionando.
    const longo = `${"b".repeat(254 - "@igreja.org".length)}@igreja.org`;
    expect(longo).toHaveLength(254);
    await criarUsuario(longo);
    await expect(entrar(longo, SENHA)).resolves.toMatchObject({ email: longo });
  });

  it("5 falhas seguidas → 6ª tentativa, mesmo com senha certa, recebe 'Muitas tentativas'", async () => {
    await criarUsuario("tes@igreja.org");
    for (let i = 0; i < 5; i++) {
      await expect(entrar("tes@igreja.org", "errada")).rejects.toThrow("E-mail ou senha inválidos");
    }
    const p = entrar(" TES@igreja.org", SENHA);
    await expect(p).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(p).rejects.toThrow("Muitas tentativas. Aguarde 15 minutos.");
    // Bloqueado: não registra nova falha nem LOGIN.
    expect(await prisma.log.count({ where: { acao: "LOGIN_FALHOU" } })).toBe(5);
    expect(await prisma.log.count({ where: { acao: "LOGIN" } })).toBe(0);
  }, 20_000);

  it("falhas com mais de 15 minutos não contam", async () => {
    await criarUsuario("tes@igreja.org");
    const antigo = new Date(Date.now() - 16 * 60 * 1000);
    await prisma.log.createMany({
      data: Array.from({ length: 5 }, () => ({
        entidade: "Login",
        entidadeId: "tes@igreja.org",
        acao: "LOGIN_FALHOU",
        dataHora: antigo,
      })),
    });
    expect((await entrar("tes@igreja.org", SENHA)).email).toBe("tes@igreja.org");
  });

  it("4 falhas ainda permitem entrar", async () => {
    await criarUsuario("tes@igreja.org");
    await prisma.log.createMany({
      data: Array.from({ length: 4 }, () => ({ entidade: "Login", entidadeId: "tes@igreja.org", acao: "LOGIN_FALHOU" })),
    });
    expect((await entrar("tes@igreja.org", SENHA)).email).toBe("tes@igreja.org");
  });
});
