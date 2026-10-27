// Dados dos quatro relatórios (Geral, Arrecadação, Despesas, Contribuições) e exportação CSV.
import { Prisma, StatusLancamento, TipoMovimento } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarDataBR } from "@/lib/datas";
import { gerarCsv } from "@/lib/csv";
import { NaoEncontrado, Validacao } from "@/lib/erros";
import { esquemaData, esquemaTextoOpcional, validar } from "./comum";

export const DIAS_MAXIMOS_PERIODO = 366;
const MS_DIA = 86_400_000;

export type FiltrosRelatorio = { de: string; ate: string; contaId?: string; categoriaId?: string };

type Cabecalho = { rotuloPeriodo: string; de: Date; ate: Date; conta: string | null; categoria: string | null };

export type LinhaGeral = {
  data: Date;
  tipo: TipoMovimento;
  categoria: string;
  conta: string;
  descricao: string | null;
  valor: Prisma.Decimal;
  previsto: boolean;
};
export type RelatorioGeral = Cabecalho & {
  linhas: LinhaGeral[];
  totalEntradas: Prisma.Decimal;
  totalSaidas: Prisma.Decimal;
  resultado: Prisma.Decimal;
};
export type RelatorioArrecadacao = Cabecalho & {
  categorias: { categoria: string; total: Prisma.Decimal; percentual: Prisma.Decimal; quantidade: number }[];
  total: Prisma.Decimal;
};
export type RelatorioDespesas = Cabecalho & {
  grupos: {
    categoria: string;
    itens: { data: Date; descricao: string | null; conta: string; valor: Prisma.Decimal }[];
    subtotal: Prisma.Decimal;
  }[];
  total: Prisma.Decimal;
};
export type RelatorioContribuicoesMembro = Cabecalho & {
  membro: string;
  itens: { data: Date; categoria: string; valor: Prisma.Decimal }[];
  total: Prisma.Decimal;
};
export type RelatorioContribuicoesTodos = Cabecalho & {
  porMembro: { membroId: string; membro: string; quantidade: number; total: Prisma.Decimal }[];
  total: Prisma.Decimal;
};
export type RelatorioContribuicoes = RelatorioContribuicoesMembro | RelatorioContribuicoesTodos;

const ZERO = () => new Prisma.Decimal(0);
const ouZero = (v: Prisma.Decimal | null | undefined) => v ?? ZERO();
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");

// ------------------------------------------------------------- Filtros

const esquemaFiltros = z.object({
  de: esquemaData,
  ate: esquemaData,
  contaId: esquemaTextoOpcional,
  categoriaId: esquemaTextoOpcional,
});

async function resolverFiltros(entrada: FiltrosRelatorio) {
  const f = validar(esquemaFiltros, { de: entrada.de, ate: entrada.ate, contaId: entrada.contaId, categoriaId: entrada.categoriaId });
  if (f.de.getTime() > f.ate.getTime()) {
    throw new Validacao("A data final deve ser igual ou posterior à inicial", { campo: "ate", regra: "periodo_invertido" });
  }
  if ((f.ate.getTime() - f.de.getTime()) / MS_DIA > DIAS_MAXIMOS_PERIODO) {
    throw new Validacao("O período pode ter no máximo 366 dias", { campo: "ate", regra: "periodo_longo" });
  }
  let conta: string | null = null;
  let categoria: string | null = null;
  if (f.contaId) {
    const c = await prisma.conta.findUnique({ where: { id: f.contaId }, select: { nome: true } });
    if (!c) throw new NaoEncontrado("Conta não encontrada");
    conta = c.nome;
  }
  if (f.categoriaId) {
    const c = await prisma.categoria.findUnique({ where: { id: f.categoriaId }, select: { nome: true } });
    if (!c) throw new NaoEncontrado("Categoria não encontrada");
    categoria = c.nome;
  }
  const cabecalho: Cabecalho = {
    rotuloPeriodo: `${formatarDataBR(f.de)} a ${formatarDataBR(f.ate)}`,
    de: f.de,
    ate: f.ate,
    conta,
    categoria,
  };
  return { f, cabecalho };
}

function whereBase(f: { contaId?: string; categoriaId?: string }): Prisma.LancamentoWhereInput {
  return { ...(f.contaId ? { contaId: f.contaId } : {}), ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}) };
}

/** Realizados pela data de realização, no período (inclusivo). */
function whereRealizados(f: { de: Date; ate: Date; contaId?: string; categoriaId?: string }): Prisma.LancamentoWhereInput {
  return { ...whereBase(f), status: StatusLancamento.REALIZADO, dataRealizacao: { gte: f.de, lte: f.ate } };
}

const dataEfetiva = (l: { dataRealizacao: Date | null; dataVencimento: Date }) => l.dataRealizacao ?? l.dataVencimento;

// ---------------------------------------------------------------- Geral

export async function relatorioGeral(
  ator: UsuarioAtual | null,
  filtros: FiltrosRelatorio & { incluirPrevistos?: boolean },
): Promise<RelatorioGeral> {
  exigir(ator, "financeiro.ver");
  const { f, cabecalho } = await resolverFiltros(filtros);
  const realizados = whereRealizados(f);
  const where: Prisma.LancamentoWhereInput = filtros.incluirPrevistos
    ? {
        OR: [
          realizados,
          { ...whereBase(f), status: StatusLancamento.PREVISTO, dataVencimento: { gte: f.de, lte: f.ate } },
        ],
      }
    : realizados;

  const [itens, totais] = await Promise.all([
    prisma.lancamento.findMany({
      where,
      select: {
        tipo: true,
        status: true,
        valor: true,
        descricao: true,
        dataVencimento: true,
        dataRealizacao: true,
        criadoEm: true,
        id: true,
        categoria: { select: { nome: true } },
        conta: { select: { nome: true } },
      },
    }),
    prisma.lancamento.groupBy({ by: ["tipo"], where, orderBy: { tipo: "asc" }, _sum: { valor: true } }),
  ]);

  const linhas = itens
    .map((l) => ({ l, data: dataEfetiva(l) }))
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.l.criadoEm.getTime() - b.l.criadoEm.getTime() || a.l.id.localeCompare(b.l.id))
    .map(
      ({ l, data }): LinhaGeral => ({
        data,
        tipo: l.tipo,
        categoria: l.categoria.nome,
        conta: l.conta.nome,
        descricao: l.descricao,
        valor: l.valor,
        previsto: l.status === StatusLancamento.PREVISTO,
      }),
    );
  const soma = (t: TipoMovimento) => ouZero(totais.find((x) => x.tipo === t)?._sum?.valor);
  const totalEntradas = soma(TipoMovimento.ENTRADA);
  const totalSaidas = soma(TipoMovimento.SAIDA);
  return { ...cabecalho, linhas, totalEntradas, totalSaidas, resultado: totalEntradas.sub(totalSaidas) };
}

// ----------------------------------------------------------- Arrecadação

/** total/soma*100 em 2 casas (half-up); a última categoria absorve a diferença para fechar 100,00. */
function percentuais(totais: Prisma.Decimal[], soma: Prisma.Decimal): Prisma.Decimal[] {
  if (!soma.gt(0)) return totais.map(() => ZERO());
  const p = totais.map((t) => t.div(soma).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  if (p.length) {
    const outras = p.slice(0, -1).reduce((a, x) => a.add(x), ZERO());
    p[p.length - 1] = new Prisma.Decimal(100).sub(outras);
  }
  return p;
}

export async function relatorioArrecadacao(ator: UsuarioAtual | null, filtros: FiltrosRelatorio): Promise<RelatorioArrecadacao> {
  exigir(ator, "financeiro.ver");
  const { f, cabecalho } = await resolverFiltros(filtros);
  const grupos = await prisma.lancamento.groupBy({
    by: ["categoriaId"],
    where: { ...whereRealizados(f), tipo: TipoMovimento.ENTRADA },
    orderBy: { categoriaId: "asc" },
    _sum: { valor: true },
    _count: { _all: true },
  });
  const nomes = new Map(
    (grupos.length
      ? await prisma.categoria.findMany({ where: { id: { in: grupos.map((g) => g.categoriaId) } }, select: { id: true, nome: true } })
      : []
    ).map((c) => [c.id, c.nome]),
  );
  const base = grupos
    .map((g) => ({ categoria: nomes.get(g.categoriaId) ?? "", total: ouZero(g._sum?.valor), quantidade: g._count._all }))
    .sort((a, b) => b.total.comparedTo(a.total) || porNome(a.categoria, b.categoria));
  const total = base.reduce((a, c) => a.add(c.total), ZERO());
  const pct = percentuais(base.map((c) => c.total), total);
  return { ...cabecalho, categorias: base.map((c, i) => ({ ...c, percentual: pct[i] })), total };
}

// -------------------------------------------------------------- Despesas

export async function relatorioDespesas(ator: UsuarioAtual | null, filtros: FiltrosRelatorio): Promise<RelatorioDespesas> {
  exigir(ator, "financeiro.ver");
  const { f, cabecalho } = await resolverFiltros(filtros);
  const where = { ...whereRealizados(f), tipo: TipoMovimento.SAIDA };
  const [itens, totais] = await Promise.all([
    prisma.lancamento.findMany({
      where,
      select: {
        id: true,
        valor: true,
        descricao: true,
        dataRealizacao: true,
        dataVencimento: true,
        criadoEm: true,
        categoria: { select: { nome: true } },
        conta: { select: { nome: true } },
      },
      orderBy: [{ dataRealizacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    }),
    prisma.lancamento.aggregate({ where, _sum: { valor: true } }),
  ]);
  const mapa = new Map<string, RelatorioDespesas["grupos"][number]>();
  for (const l of itens) {
    const nome = l.categoria.nome;
    const g = mapa.get(nome) ?? { categoria: nome, itens: [], subtotal: ZERO() };
    g.itens.push({ data: dataEfetiva(l), descricao: l.descricao, conta: l.conta.nome, valor: l.valor });
    g.subtotal = g.subtotal.add(l.valor);
    mapa.set(nome, g);
  }
  const grupos = [...mapa.values()].sort((a, b) => porNome(a.categoria, b.categoria));
  return { ...cabecalho, grupos, total: ouZero(totais._sum.valor) };
}

// --------------------------------------------------------- Contribuições

export async function relatorioContribuicoes(
  ator: UsuarioAtual | null,
  filtros: FiltrosRelatorio & { membroId?: string },
): Promise<RelatorioContribuicoes> {
  exigir(ator, "financeiro.ver");
  exigir(ator, "membros.ver_nomes");
  const { f, cabecalho } = await resolverFiltros(filtros);
  const membroId = filtros.membroId?.trim() || undefined;
  const where: Prisma.LancamentoWhereInput = {
    ...whereRealizados(f),
    tipo: TipoMovimento.ENTRADA,
    categoria: { nominal: true },
    membroId: membroId ?? { not: null },
  };

  if (membroId) {
    const membro = await prisma.membro.findUnique({ where: { id: membroId }, select: { nome: true } });
    if (!membro) throw new NaoEncontrado("Membro não encontrado");
    const itens = await prisma.lancamento.findMany({
      where,
      select: { valor: true, dataRealizacao: true, dataVencimento: true, categoria: { select: { nome: true } } },
      orderBy: [{ dataRealizacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    });
    return {
      ...cabecalho,
      membro: membro.nome,
      itens: itens.map((l) => ({ data: dataEfetiva(l), categoria: l.categoria.nome, valor: l.valor })),
      total: itens.reduce((a, l) => a.add(l.valor), ZERO()),
    };
  }

  const grupos = await prisma.lancamento.groupBy({
    by: ["membroId"],
    where,
    orderBy: { membroId: "asc" },
    _sum: { valor: true },
    _count: { _all: true },
  });
  const ids = grupos.flatMap((g) => (g.membroId ? [g.membroId] : []));
  const nomes = new Map(
    (ids.length ? await prisma.membro.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : []).map((m) => [m.id, m.nome]),
  );
  const porMembro = grupos
    .flatMap((g) =>
      g.membroId ? [{ membroId: g.membroId, membro: nomes.get(g.membroId) ?? "", quantidade: g._count._all, total: ouZero(g._sum?.valor) }] : [],
    )
    .sort((a, b) => porNome(a.membro, b.membro) || a.membroId.localeCompare(b.membroId));
  return { ...cabecalho, porMembro, total: porMembro.reduce((a, m) => a.add(m.total), ZERO()) };
}

// ------------------------------------------------------------------- CSV

type Dados = {
  geral: RelatorioGeral;
  arrecadacao: RelatorioArrecadacao;
  despesas: RelatorioDespesas;
  contribuicoes: RelatorioContribuicoes;
};

export function csvDe<R extends keyof Dados>(relatorio: R, dados: Dados[R]): string {
  switch (relatorio) {
    case "geral": {
      const d = dados as RelatorioGeral;
      return gerarCsv<LinhaGeral>(
        [
          { titulo: "Data", valor: (l) => l.data },
          { titulo: "Tipo", valor: (l) => (l.tipo === TipoMovimento.ENTRADA ? "Entrada" : "Saída") },
          { titulo: "Categoria", valor: (l) => l.categoria },
          { titulo: "Conta", valor: (l) => l.conta },
          { titulo: "Descrição", valor: (l) => l.descricao },
          { titulo: "Valor", valor: (l) => l.valor },
          { titulo: "Situação", valor: (l) => (l.previsto ? "Previsto" : "Realizado") },
        ],
        d.linhas,
      );
    }
    case "arrecadacao": {
      const d = dados as RelatorioArrecadacao;
      return gerarCsv(
        [
          { titulo: "Categoria", valor: (c) => c.categoria },
          { titulo: "Quantidade", valor: (c) => String(c.quantidade) },
          { titulo: "Total", valor: (c) => c.total },
          { titulo: "Percentual", valor: (c) => c.percentual },
        ],
        d.categorias,
      );
    }
    case "despesas": {
      const d = dados as RelatorioDespesas;
      const linhas = d.grupos.flatMap((g) => g.itens.map((i) => ({ categoria: g.categoria, ...i })));
      return gerarCsv(
        [
          { titulo: "Categoria", valor: (l) => l.categoria },
          { titulo: "Data", valor: (l) => l.data },
          { titulo: "Descrição", valor: (l) => l.descricao },
          { titulo: "Conta", valor: (l) => l.conta },
          { titulo: "Valor", valor: (l) => l.valor },
        ],
        linhas,
      );
    }
    case "contribuicoes": {
      const d = dados as RelatorioContribuicoes;
      if ("itens" in d) {
        return gerarCsv(
          [
            { titulo: "Data", valor: (i) => i.data },
            { titulo: "Categoria", valor: (i) => i.categoria },
            { titulo: "Valor", valor: (i) => i.valor },
          ],
          d.itens,
        );
      }
      return gerarCsv(
        [
          { titulo: "Membro", valor: (m) => m.membro },
          { titulo: "Quantidade", valor: (m) => String(m.quantidade) },
          { titulo: "Total", valor: (m) => m.total },
        ],
        d.porMembro,
      );
    }
    default:
      throw new Validacao("Relatório inválido");
  }
}
