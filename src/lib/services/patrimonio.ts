// Patrimônio (versão mínima): cadastro de bens com descrição, valor e local. Sem empréstimo nem baixa.
import { Prisma } from "@prisma/client";
import type { Bem } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarBRL, parseValorBR } from "@/lib/dinheiro";
import { NaoEncontrado } from "@/lib/erros";
import { diffCampos, registrarLog } from "@/lib/log";
import { converterOuIssue, validar } from "./comum";

export const MSG_BEM_NAO_ENCONTRADO = "Bem não encontrado";

export type DadosBem = { descricao: string; valor: string; local: string };

const esquemaBem = z.object({
  descricao: z.string({ error: "Informe a descrição" }).trim().min(1, "Informe a descrição"),
  // Zero é aceito: bem doado cujo valor ainda não se sabe.
  valor: z.string({ error: "Valor inválido" }).transform((t, ctx) => {
    if (t.trim() === "") {
      ctx.issues.push({ code: "custom", message: "Informe o valor (use 0 se não souber)", input: t, params: { regra: "obrigatorio" } });
      return z.NEVER;
    }
    return converterOuIssue(ctx, t, (x) => parseValorBR(x, { permitirZero: true }));
  }),
  local: z.string({ error: "Informe o local" }).trim().min(1, "Informe o local"),
});

const textoBem = (b: Pick<Bem, "descricao" | "valor" | "local">) => ({
  descricao: b.descricao,
  valor: formatarBRL(b.valor),
  local: b.local,
});

export async function listarBens(ator: UsuarioAtual | null): Promise<{ itens: Bem[]; valorTotal: Prisma.Decimal }> {
  exigir(ator, "patrimonio.ver");
  const itens = await prisma.bem.findMany({ orderBy: [{ descricao: "asc" }, { id: "asc" }] });
  return { itens, valorTotal: itens.reduce((acc, b) => acc.add(b.valor), new Prisma.Decimal(0)) };
}

export async function obterBem(ator: UsuarioAtual | null, id: string): Promise<Bem> {
  exigir(ator, "patrimonio.ver");
  const b = await prisma.bem.findUnique({ where: { id } });
  if (!b) throw new NaoEncontrado(MSG_BEM_NAO_ENCONTRADO);
  return b;
}

export async function criarBem(ator: UsuarioAtual | null, d: DadosBem): Promise<Bem> {
  const quem = exigir(ator, "patrimonio.gerenciar");
  const v = validar(esquemaBem, d);
  return prisma.$transaction(async (tx) => {
    const b = await tx.bem.create({ data: v });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Bem",
      entidadeId: b.id,
      acao: "CRIOU",
      valorNovo: `${b.descricao} · ${formatarBRL(b.valor)} · ${b.local}`,
    });
    return b;
  });
}

export async function atualizarBem(ator: UsuarioAtual | null, id: string, d: DadosBem): Promise<Bem> {
  const quem = exigir(ator, "patrimonio.gerenciar");
  const v = validar(esquemaBem, d);
  return prisma.$transaction(async (tx) => {
    const atual = await tx.bem.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado(MSG_BEM_NAO_ENCONTRADO);
    const b = await tx.bem.update({ where: { id }, data: v });
    for (const m of diffCampos(textoBem(atual), textoBem(b))) {
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Bem",
        entidadeId: id,
        acao: "ALTEROU",
        campo: m.campo,
        valorAnterior: m.de ?? undefined,
        valorNovo: m.para ?? undefined,
      });
    }
    return b;
  });
}
