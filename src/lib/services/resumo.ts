// Saldo por conta, resumo do mês e alertas de vencimento (somente leitura).
import { Prisma, StatusLancamento, StatusTransferencia, TipoMovimento } from "@prisma/client";
import type { PrismaClient, TipoConta } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { hojeSP, limitesDoMes } from "@/lib/datas";
import { validar } from "./comum";

export const DIAS_PROXIMOS = 7;

export type SaldoConta = { contaId: string; nome: string; tipo: TipoConta; saldo: Prisma.Decimal };

export type TotalCategoria = { categoria: string; total: Prisma.Decimal };

export type ResumoMes = {
  entradas: Prisma.Decimal;
  saidas: Prisma.Decimal;
  resultado: Prisma.Decimal;
  porCategoriaEntrada: TotalCategoria[];
  porCategoriaSaida: TotalCategoria[];
};

export type AlertaItem = {
  id: string;
  tipo: TipoMovimento;
  descricao: string | null;
  categoria: string;
  valor: Prisma.Decimal;
  dataVencimento: Date;
};

const ZERO = () => new Prisma.Decimal(0);
const ouZero = (v: Prisma.Decimal | null | undefined) => v ?? ZERO();

// ------------------------------------------------------------------ Saldo

/**
 * saldo = saldoInicial + Σ entradas REALIZADAS − Σ saídas REALIZADAS
 *       + Σ transferências ATIVAS recebidas − Σ transferências ATIVAS enviadas.
 * Uma agregação por fonte no banco; a combinação é feita aqui.
 */
export async function saldoPorConta(ator: UsuarioAtual | null): Promise<SaldoConta[]> {
  exigir(ator, "financeiro.ver");
  const [contas, lancamentos, enviadas, recebidas] = await Promise.all([
    prisma.conta.findMany({
      select: { id: true, nome: true, tipo: true, saldoInicial: true, ativa: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    }),
    prisma.lancamento.groupBy({
      by: ["contaId", "tipo"],
      where: { status: StatusLancamento.REALIZADO },
      orderBy: [{ contaId: "asc" }, { tipo: "asc" }],
      _sum: { valor: true },
    }),
    prisma.transferencia.groupBy({
      by: ["contaOrigemId"],
      where: { status: StatusTransferencia.ATIVA },
      orderBy: { contaOrigemId: "asc" },
      _sum: { valor: true },
    }),
    prisma.transferencia.groupBy({
      by: ["contaDestinoId"],
      where: { status: StatusTransferencia.ATIVA },
      orderBy: { contaDestinoId: "asc" },
      _sum: { valor: true },
    }),
  ]);

  const delta = new Map<string, Prisma.Decimal>();
  const somar = (contaId: string, v: Prisma.Decimal) =>
    delta.set(contaId, (delta.get(contaId) ?? ZERO()).add(v));

  for (const l of lancamentos) {
    const v = ouZero(l._sum?.valor);
    somar(l.contaId, l.tipo === TipoMovimento.ENTRADA ? v : v.neg());
  }
  for (const t of recebidas) somar(t.contaDestinoId, ouZero(t._sum?.valor));
  for (const t of enviadas) somar(t.contaOrigemId, ouZero(t._sum?.valor).neg());

  return contas
    .map((c) => ({
      contaId: c.id,
      nome: c.nome,
      tipo: c.tipo,
      ativa: c.ativa,
      saldo: c.saldoInicial.add(delta.get(c.id) ?? ZERO()),
    }))
    .filter((c) => c.ativa || !c.saldo.isZero())
    .map(({ contaId, nome, tipo, saldo }) => ({ contaId, nome, tipo, saldo }));
}

/**
 * Saldo de uma conta, com a mesma fórmula de `saldoPorConta`, sem checar permissão:
 * uso interno dos serviços (aceita o cliente da transação). Conta inexistente → zero.
 */
export async function saldoDaConta(
  db: Prisma.TransactionClient | PrismaClient,
  contaId: string,
): Promise<Prisma.Decimal> {
  // Sequencial: o cliente da transação usa uma única conexão.
  const conta = await db.conta.findUnique({ where: { id: contaId }, select: { saldoInicial: true } });
  const lancamentos = await db.lancamento.groupBy({
    by: ["tipo"],
    where: { contaId, status: StatusLancamento.REALIZADO },
    orderBy: { tipo: "asc" },
    _sum: { valor: true },
  });
  const enviadas = await db.transferencia.aggregate({
    where: { contaOrigemId: contaId, status: StatusTransferencia.ATIVA },
    _sum: { valor: true },
  });
  const recebidas = await db.transferencia.aggregate({
    where: { contaDestinoId: contaId, status: StatusTransferencia.ATIVA },
    _sum: { valor: true },
  });
  let saldo = conta?.saldoInicial ?? ZERO();
  for (const l of lancamentos) {
    const v = ouZero(l._sum?.valor);
    saldo = l.tipo === TipoMovimento.ENTRADA ? saldo.add(v) : saldo.sub(v);
  }
  return saldo.add(ouZero(recebidas._sum.valor)).sub(ouZero(enviadas._sum.valor));
}

export async function saldoTotal(ator: UsuarioAtual | null): Promise<Prisma.Decimal> {
  const contas = await saldoPorConta(ator);
  return contas.reduce((acc, c) => acc.add(c.saldo), ZERO());
}

// ---------------------------------------------------------- Resumo do mês

const esquemaMes = z.object({
  ano: z.number({ error: "Mês inválido" }).int("Mês inválido").min(2000, "Mês inválido").max(2100, "Mês inválido"),
  mes: z.number({ error: "Mês inválido" }).int("Mês inválido").min(1, "Mês inválido").max(12, "Mês inválido"),
});

const porTotalDesc = (a: TotalCategoria, b: TotalCategoria) =>
  b.total.comparedTo(a.total) || a.categoria.localeCompare(b.categoria, "pt-BR");

/** Só lançamentos REALIZADOS com dataRealizacao no mês; transferências não entram. */
export async function resumoMes(ator: UsuarioAtual | null, ano: number, mes: number): Promise<ResumoMes> {
  exigir(ator, "financeiro.ver");
  const v = validar(esquemaMes, { ano, mes });
  const { inicio, fim } = limitesDoMes(v.ano, v.mes);

  const grupos = await prisma.lancamento.groupBy({
    by: ["categoriaId", "tipo"],
    where: { status: StatusLancamento.REALIZADO, dataRealizacao: { gte: inicio, lt: fim } },
    orderBy: [{ categoriaId: "asc" }, { tipo: "asc" }],
    _sum: { valor: true },
  });
  const categorias = grupos.length
    ? await prisma.categoria.findMany({
        where: { id: { in: [...new Set(grupos.map((g) => g.categoriaId))] } },
        select: { id: true, nome: true },
      })
    : [];
  const nomes = new Map(categorias.map((c) => [c.id, c.nome]));

  const porCategoriaEntrada: TotalCategoria[] = [];
  const porCategoriaSaida: TotalCategoria[] = [];
  let entradas = ZERO();
  let saidas = ZERO();
  for (const g of grupos) {
    const item = { categoria: nomes.get(g.categoriaId) ?? "", total: ouZero(g._sum?.valor) };
    if (g.tipo === TipoMovimento.ENTRADA) {
      porCategoriaEntrada.push(item);
      entradas = entradas.add(item.total);
    } else {
      porCategoriaSaida.push(item);
      saidas = saidas.add(item.total);
    }
  }
  porCategoriaEntrada.sort(porTotalDesc);
  porCategoriaSaida.sort(porTotalDesc);

  return { entradas, saidas, resultado: entradas.sub(saidas), porCategoriaEntrada, porCategoriaSaida };
}

// ---------------------------------------------------------------- Alertas

/**
 * PREVISTOS com vencimento antes de hoje (vencidos) ou de hoje até hoje+7
 * inclusive (próximos). "Hoje" é o dia civil de São Paulo.
 */
export async function alertas(ator: UsuarioAtual | null): Promise<{ vencidos: AlertaItem[]; proximos: AlertaItem[] }> {
  exigir(ator, "financeiro.ver");
  const hoje = hojeSP();
  const limite = new Date(hoje.getTime());
  limite.setUTCDate(limite.getUTCDate() + DIAS_PROXIMOS);

  const itens = await prisma.lancamento.findMany({
    where: { status: StatusLancamento.PREVISTO, dataVencimento: { lte: limite } },
    select: {
      id: true,
      tipo: true,
      descricao: true,
      valor: true,
      dataVencimento: true,
      categoria: { select: { nome: true } },
    },
    orderBy: [{ dataVencimento: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
  });

  const vencidos: AlertaItem[] = [];
  const proximos: AlertaItem[] = [];
  for (const l of itens) {
    const item: AlertaItem = {
      id: l.id,
      tipo: l.tipo,
      descricao: l.descricao,
      categoria: l.categoria.nome,
      valor: l.valor,
      dataVencimento: l.dataVencimento,
    };
    (l.dataVencimento < hoje ? vencidos : proximos).push(item);
  }
  return { vencidos, proximos };
}
