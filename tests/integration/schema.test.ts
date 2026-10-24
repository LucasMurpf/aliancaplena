import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetarBanco } from "../helpers/db";

beforeEach(async () => {
  await resetarBanco();
});

test("cria e lê uma linha em cada tabela (SQL da migração == schema.prisma)", async () => {
  const config = await prisma.configuracao.create({ data: { nomeIgreja: "Aliança Plena" } });
  expect(config.metricasAtivas).toBe(true);

  const usuario = await prisma.usuario.create({
    data: {
      nome: "Ana",
      email: "ana@igreja.org",
      senhaHash: "hash",
      papeis: { create: [{ papel: "ADMIN" }, { papel: "TESOUREIRO" }] },
    },
    include: { papeis: true },
  });
  expect(usuario.papeis).toHaveLength(2);
  expect(usuario.ativo).toBe(true);

  const membro = await prisma.membro.create({
    data: { nome: "João", dataNascimento: new Date("1990-05-17") },
  });
  expect((await prisma.membro.findUniqueOrThrow({ where: { id: membro.id } })).ativo).toBe(true);

  const conta = await prisma.conta.create({
    data: { nome: "Caixa tesouraria", tipo: "CAIXA", saldoInicial: "100.50" },
  });
  expect(conta.saldoInicial.toString()).toBe("100.5");

  const categoria = await prisma.categoria.create({
    data: { nome: "Dízimo", tipo: "ENTRADA", nominal: true },
  });

  const lancamento = await prisma.lancamento.create({
    data: {
      tipo: "ENTRADA",
      valor: "1234.56",
      categoriaId: categoria.id,
      contaId: conta.id,
      membroId: membro.id,
      status: "PREVISTO",
      dataVencimento: new Date("2026-11-01"),
      criadoPorId: usuario.id,
    },
  });
  expect(lancamento.valor.toString()).toBe("1234.56");
  expect(lancamento.dataVencimento.toISOString().slice(0, 10)).toBe("2026-11-01");

  const conta2 = await prisma.conta.create({ data: { nome: "Banco", tipo: "BANCO" } });
  const transferencia = await prisma.transferencia.create({
    data: {
      contaOrigemId: conta.id,
      contaDestinoId: conta2.id,
      valor: "50",
      data: new Date("2026-11-02"),
      criadoPorId: usuario.id,
    },
  });
  expect(transferencia.status).toBe("ATIVA");

  const anexo = await prisma.anexo.create({
    data: {
      lancamentoId: lancamento.id,
      url: "anexos/recibo.pdf",
      nomeArquivo: "recibo.pdf",
      mimeType: "application/pdf",
      tamanho: 2048,
      enviadoPorId: usuario.id,
    },
  });
  expect(anexo.tamanho).toBe(2048);

  const logSemUsuario = await prisma.log.create({
    data: { entidade: "Usuario", entidadeId: "x", acao: "login_falhou" },
  });
  expect(logSemUsuario.usuarioId).toBeNull();
  const logComUsuario = await prisma.log.create({
    data: {
      usuarioId: usuario.id,
      entidade: "Lancamento",
      entidadeId: lancamento.id,
      acao: "editar",
      campo: "valor",
      valorAnterior: "R$ 10,00",
      valorNovo: "R$ 20,00",
    },
  });
  expect(logComUsuario.valorNovo).toBe("R$ 20,00");

  const evento = await prisma.eventoUso.create({
    data: {
      papeis: ["ADMIN", "PASTOR"],
      dispositivo: "CELULAR",
      evento: "tela_aberta",
      tela: "/lancamentos",
    },
  });
  expect(evento.propriedades).toEqual({});
  expect(evento.papeis).toEqual(["ADMIN", "PASTOR"]);
});

test("email de usuário é único e categoria é única por nome+tipo", async () => {
  await prisma.usuario.create({ data: { nome: "A", email: "a@x.org", senhaHash: "h" } });
  await expect(
    prisma.usuario.create({ data: { nome: "B", email: "a@x.org", senhaHash: "h" } }),
  ).rejects.toThrow();

  await prisma.categoria.create({ data: { nome: "Missões", tipo: "ENTRADA" } });
  await prisma.categoria.create({ data: { nome: "Missões", tipo: "SAIDA" } });
  await expect(
    prisma.categoria.create({ data: { nome: "Missões", tipo: "ENTRADA" } }),
  ).rejects.toThrow();
});
