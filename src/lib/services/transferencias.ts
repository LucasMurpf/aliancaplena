// Transferências entre contas da igreja: criar, cancelar, ler e listar.
import { Prisma, StatusTransferencia } from "@prisma/client";
import type { Transferencia } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarDataBR } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { rastrearServidor } from "./metricas";
import { esquemaData, esquemaDataOpcional, esquemaId, esquemaMotivo, esquemaTextoOpcional, esquemaValor, validar } from "./comum";

export const MSG_TRANSFERENCIA_NAO_ENCONTRADA = "Transferência não encontrada";
export const MSG_MESMA_CONTA = "Escolha contas diferentes";
export const MSG_JA_CANCELADA = "Transferência já cancelada";

export type DadosTransferencia = {
  contaOrigemId: string;
  contaDestinoId: string;
  valor: string;
  data: string;
  descricao?: string;
};

export type FiltroTransferencias = {
  de?: string;
  ate?: string;
  contaId?: string;
  incluirCanceladas?: boolean;
};

const esquemaDados = z.object({
  contaOrigemId: esquemaId("Informe a conta de origem"),
  contaDestinoId: esquemaId("Informe a conta de destino"),
  valor: esquemaValor,
  data: esquemaData,
  descricao: esquemaTextoOpcional,
});

const esquemaFiltro = z.object({
  de: esquemaDataOpcional,
  ate: esquemaDataOpcional,
  contaId: esquemaTextoOpcional,
  incluirCanceladas: z.boolean({ error: "Filtro inválido" }).optional(),
});

const incluirContas = {
  contaOrigem: { select: { id: true, nome: true, tipo: true, ativa: true } },
  contaDestino: { select: { id: true, nome: true, tipo: true, ativa: true } },
} satisfies Prisma.TransferenciaInclude;

export type TransferenciaDetalhada = Prisma.TransferenciaGetPayload<{ include: typeof incluirContas }>;

export async function criarTransferencia(ator: UsuarioAtual | null, d: DadosTransferencia): Promise<Transferencia> {
  const quem = exigir(ator, "financeiro.lancar");
  const v = validar(esquemaDados, d, { campos: { contaOrigemId: "contaOrigem", contaDestinoId: "contaDestino" } });
  if (v.contaOrigemId === v.contaDestinoId) throw new RegraDeNegocio(MSG_MESMA_CONTA, { campo: "contaDestino", regra: "igual_origem" });
  return prisma.$transaction(async (tx) => {
    // Sequencial: o cliente da transação usa uma única conexão.
    const origem = await tx.conta.findUnique({ where: { id: v.contaOrigemId } });
    const destino = await tx.conta.findUnique({ where: { id: v.contaDestinoId } });
    if (!origem) throw new NaoEncontrado("Conta de origem não encontrada");
    if (!destino) throw new NaoEncontrado("Conta de destino não encontrada");
    if (!origem.ativa || !destino.ativa) throw new RegraDeNegocio("Conta inativa");
    const t = await tx.transferencia.create({
      data: {
        contaOrigemId: v.contaOrigemId,
        contaDestinoId: v.contaDestinoId,
        valor: v.valor,
        data: v.data,
        descricao: v.descricao,
        criadoPorId: quem.id,
      },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Transferencia",
      entidadeId: t.id,
      acao: "CRIOU",
      valorNovo: `${formatarBRL(t.valor)} de ${origem.nome} para ${destino.nome} em ${formatarDataBR(t.data)}`,
    });
    await rastrearServidor(tx, quem, "transferencia_criada");
    return t;
  });
}

export async function cancelarTransferencia(ator: UsuarioAtual | null, id: string, motivo: string): Promise<Transferencia> {
  const quem = exigir(ator, "financeiro.lancar");
  const m = validar(esquemaMotivo, motivo, { campo: "motivo" });
  return prisma.$transaction(async (tx) => {
    const atual = await tx.transferencia.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado(MSG_TRANSFERENCIA_NAO_ENCONTRADA);
    if (atual.status === StatusTransferencia.CANCELADA) throw new RegraDeNegocio(MSG_JA_CANCELADA);
    // Condicional: se outra transação cancelou antes, count será 0.
    const r = await tx.transferencia.updateMany({
      where: { id, status: StatusTransferencia.ATIVA },
      data: { status: StatusTransferencia.CANCELADA, motivoCancelamento: m },
    });
    if (r.count !== 1) throw new RegraDeNegocio(MSG_JA_CANCELADA);
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Transferencia",
      entidadeId: id,
      acao: "CANCELOU",
      campo: "status",
      valorAnterior: atual.status,
      valorNovo: m,
    });
    return tx.transferencia.findUniqueOrThrow({ where: { id } });
  });
}

export async function obterTransferencia(ator: UsuarioAtual | null, id: string): Promise<TransferenciaDetalhada> {
  exigir(ator, "financeiro.ver");
  const t = await prisma.transferencia.findUnique({ where: { id }, include: incluirContas });
  if (!t) throw new NaoEncontrado(MSG_TRANSFERENCIA_NAO_ENCONTRADA);
  return t;
}

export async function listarTransferencias(
  ator: UsuarioAtual | null,
  filtro: FiltroTransferencias,
): Promise<TransferenciaDetalhada[]> {
  exigir(ator, "financeiro.ver");
  const f = validar(esquemaFiltro, filtro ?? {});
  const e: Prisma.TransferenciaWhereInput[] = [];
  if (!f.incluirCanceladas) e.push({ status: StatusTransferencia.ATIVA });
  if (f.contaId) e.push({ OR: [{ contaOrigemId: f.contaId }, { contaDestinoId: f.contaId }] });
  if (f.de || f.ate) e.push({ data: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } });
  return prisma.transferencia.findMany({
    where: { AND: e },
    include: incluirContas,
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }, { id: "desc" }],
  });
}
