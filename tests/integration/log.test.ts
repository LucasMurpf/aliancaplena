import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { diffCampos, registrarLog } from "@/lib/log";
import { resetarBanco } from "../helpers/db";

class ErroDeTeste extends Error {}

describe("diffCampos", () => {
  it("retorna só o campo que mudou", () => {
    const r = diffCampos(
      { descricao: "Oferta", valor: "R$ 10,00" },
      { descricao: "Oferta", valor: "R$ 20,00" },
    );
    expect(r).toEqual([{ campo: "valor", de: "R$ 10,00", para: "R$ 20,00" }]);
  });

  it("trata null e ausente como iguais e segue a ordem de depois", () => {
    const r = diffCampos({ a: null }, { b: "x", a: null, c: null });
    expect(r).toEqual([{ campo: "b", de: null, para: "x" }]);
  });
});

describe("registrarLog", () => {
  beforeEach(async () => {
    await resetarBanco();
  });

  it("grava 1 linha quando a transação confirma", async () => {
    await prisma.$transaction(async (tx) => {
      await registrarLog(tx, {
        entidade: "Lancamento",
        entidadeId: "abc",
        acao: "CRIOU",
      });
    });
    const logs = await prisma.log.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entidade: "Lancamento", entidadeId: "abc", acao: "CRIOU", campo: null });
  });

  it("não grava nada quando a transação sofre rollback", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarLog(tx, { entidade: "Conta", entidadeId: "x", acao: "ALTEROU", campo: "nome", valorAnterior: "A", valorNovo: "B" });
        throw new ErroDeTeste("falha");
      }),
    ).rejects.toBeInstanceOf(ErroDeTeste);
    expect(await prisma.log.count()).toBe(0);
  });
});
