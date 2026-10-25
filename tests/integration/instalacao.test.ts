import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { conferirSenha } from "@/lib/auth";
import { RegraDeNegocio, Validacao } from "@/lib/erros";
import { instalar, sistemaInstalado } from "@/lib/services/instalacao";
import { resetarBanco } from "../helpers/db";

const dados = {
  nomeIgreja: "Igreja Aliança Plena",
  nomeConta: "Caixa",
  tipoConta: "CAIXA" as const,
  saldoInicial: "1.234,56",
  adminNome: "Administrador",
  adminEmail: "  Admin@Igreja.ORG ",
  adminSenha: "senha-forte-123",
};

beforeEach(async () => {
  await resetarBanco();
});

describe("instalar", () => {
  it("sistema vazio → não instalado", async () => {
    expect(await sistemaInstalado()).toBe(false);
  });

  it("instala: 1 usuário ADMIN, 1 configuração, 12 categorias, 1 conta e log INSTALOU", async () => {
    const admin = await instalar({ ...dados, logoUrl: "https://exemplo.org/logo.png" });

    expect(admin).toMatchObject({ nome: "Administrador", email: "admin@igreja.org", papeis: ["ADMIN"] });
    expect(await sistemaInstalado()).toBe(true);

    const usuarios = await prisma.usuario.findMany({ include: { papeis: true } });
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].papeis.map((p) => p.papel)).toEqual(["ADMIN"]);
    expect(usuarios[0].senhaHash).not.toBe(dados.adminSenha);
    expect(await conferirSenha(dados.adminSenha, usuarios[0].senhaHash)).toBe(true);

    const configs = await prisma.configuracao.findMany();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ nomeIgreja: "Igreja Aliança Plena", logoUrl: "https://exemplo.org/logo.png" });

    expect(await prisma.categoria.count()).toBe(12);

    const contas = await prisma.conta.findMany();
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({ nome: "Caixa", tipo: "CAIXA" });
    expect(contas[0].saldoInicial.toFixed(2)).toBe("1234.56");

    const logs = await prisma.log.findMany({ where: { acao: "INSTALOU" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entidade: "Configuracao", entidadeId: configs[0].id, usuarioId: admin.id });
  });

  it.each(["0", "0,00", ""])("aceita saldo inicial zero (%j)", async (saldoInicial) => {
    await instalar({ ...dados, saldoInicial });
    const conta = await prisma.conta.findFirstOrThrow();
    expect(conta.saldoInicial.toFixed(2)).toBe("0.00");
  });

  it("saldo inicial inválido → Validacao", async () => {
    await expect(instalar({ ...dados, saldoInicial: "abc" })).rejects.toBeInstanceOf(Validacao);
    expect(await sistemaInstalado()).toBe(false);
  });

  it("segunda chamada → RegraDeNegocio('Sistema já instalado')", async () => {
    await instalar(dados);
    const p = instalar({ ...dados, adminEmail: "outro@igreja.org" });
    await expect(p).rejects.toBeInstanceOf(RegraDeNegocio);
    await expect(p).rejects.toThrow("Sistema já instalado");
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.configuracao.count()).toBe(1);
  });

  it("Review Focus 5: duas instalações simultâneas → só uma vence", async () => {
    const d2 = { ...dados, nomeIgreja: "Outra Igreja", adminEmail: "segundo@igreja.org", nomeConta: "Banco", tipoConta: "BANCO" as const };
    const resultados = await Promise.allSettled([instalar(dados), instalar(d2)]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejeitado = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejeitado.reason).toBeInstanceOf(RegraDeNegocio);
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.configuracao.count()).toBe(1);
    expect(await prisma.conta.count()).toBe(1);
    expect(await prisma.categoria.count()).toBe(12);
  }, 20_000);

  describe("validação", () => {
    it("senha com menos de 8 caracteres → Validacao", async () => {
      const p = instalar({ ...dados, adminSenha: "1234567" });
      await expect(p).rejects.toBeInstanceOf(Validacao);
      await expect(p).rejects.toThrow("A senha deve ter entre 8 e 72 caracteres");
    });

    it("senha com mais de 72 bytes → Validacao", async () => {
      // 37 caracteres "ç" = 74 bytes em UTF-8.
      await expect(instalar({ ...dados, adminSenha: "ç".repeat(37) })).rejects.toThrow(
        "A senha deve ter entre 8 e 72 caracteres",
      );
    });

    it("e-mail inválido → Validacao", async () => {
      await expect(instalar({ ...dados, adminEmail: "nao-e-email" })).rejects.toBeInstanceOf(Validacao);
    });

    it("nome da igreja ou do admin em branco → Validacao", async () => {
      await expect(instalar({ ...dados, nomeIgreja: "   " })).rejects.toBeInstanceOf(Validacao);
      await expect(instalar({ ...dados, adminNome: "" })).rejects.toBeInstanceOf(Validacao);
      expect(await sistemaInstalado()).toBe(false);
    });
  });
});
