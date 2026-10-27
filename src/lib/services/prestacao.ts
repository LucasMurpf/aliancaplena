// Prestação de contas pública: foto (snapshot) versionada de um mês, aberta por token aleatório.
// O snapshot só leva nomes de categoria, totais e — para saídas de categorias com
// `detalharPublico` — data, descrição e valor. Nunca membro, conta, usuário, anexo ou descrição
// de entrada: as consultas que o alimentam nem selecionam essas relações.
import { randomBytes } from "node:crypto";
import { Prisma, StatusLancamento, TipoMovimento } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { hojeSP, limitesDoMes } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { montarSnapshot, type DadosSnapshot, type SnapshotPrestacao } from "@/lib/prestacao/snapshot";
import { rastrearServidor } from "./metricas";
import { saldoDaContaAte } from "./resumo";
import { esquemaId, TRAVA_PRESTACAO, validar } from "./comum";

export type { SnapshotPrestacao } from "@/lib/prestacao/snapshot";

export const MSG_MES_FUTURO = "Não é possível publicar um mês futuro";
export const MSG_PRESTACAO_NAO_ENCONTRADA = "Prestação de contas não encontrada";
export const MSG_MOTIVO_RETIRADA = "Informe o motivo da retirada";
export const MSG_JA_DESPUBLICADA = "Esta versão já foi despublicada";

/** 32 bytes em base64url, sem preenchimento. */
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MS_DIA = 86_400_000;

export type PrestacaoPublicada = { id: string; ano: number; mes: number; versao: number; token: string; snapshot: SnapshotPrestacao };

export type PrestacaoListada = {
  id: string;
  ano: number;
  mes: number;
  versao: number;
  token: string;
  publicadaEm: Date;
  publicadaPor: string;
  visualizacoes: number;
  despublicada: boolean;
  despublicadaEm: Date | null;
};

export type PrestacaoAberta = {
  estado: "ok" | "despublicada" | "inexistente";
  snapshot?: SnapshotPrestacao;
  versao?: number;
  /** dd/mm/aaaa no fuso de São Paulo. */
  publicadaEm?: string;
  versaoMaisRecente?: { versao: number; token: string };
};

type Db = Prisma.TransactionClient | PrismaClient;

const ZERO = () => new Prisma.Decimal(0);

const esquemaMotivoRetirada = z.string({ error: MSG_MOTIVO_RETIRADA }).trim().min(1, MSG_MOTIVO_RETIRADA);

const esquemaMes = z.object({
  ano: z.number({ error: "Mês inválido" }).int("Mês inválido").min(2000, "Mês inválido").max(2100, "Mês inválido"),
  mes: z.number({ error: "Mês inválido" }).int("Mês inválido").min(1, "Mês inválido").max(12, "Mês inválido"),
});
const esquemaFiltroLista = z.object({
  ano: z.number({ error: "Ano inválido" }).int("Ano inválido").min(2000, "Ano inválido").max(2100, "Ano inválido").optional(),
});

const urlHttp = (t: string | null | undefined) => (t && /^https?:\/\//i.test(t) ? t : null);

/** dd/mm/aaaa do instante `d` no fuso de São Paulo. */
function dataSP(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")}`;
}

/** Valida o mês e calcula o corte: último dia do mês, ou hoje (SP) no mês corrente. Futuro → recusa. */
function periodo(ano: number, mes: number): { ano: number; mes: number; inicio: Date; dataCorte: Date; parcial: boolean } {
  const v = validar(esquemaMes, { ano, mes }, { campo: "mes" });
  const { inicio, fim } = limitesDoMes(v.ano, v.mes);
  const hoje = hojeSP();
  if (inicio.getTime() > hoje.getTime()) throw new RegraDeNegocio(MSG_MES_FUTURO, { campo: "mes", regra: "mes_futuro" });
  // Mês corrente (inclusive no último dia, que ainda não acabou): foto "até hoje".
  const parcial = hoje.getTime() < fim.getTime();
  return { ano: v.ano, mes: v.mes, inicio, dataCorte: parcial ? hoje : new Date(fim.getTime() - MS_DIA), parcial };
}

/** Saldo somado de todas as contas (ativas e inativas) no fim do dia `data`. Interno. */
export async function saldoTotalEm(db: Db, data: Date): Promise<Prisma.Decimal> {
  const contas = await db.conta.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let total = ZERO();
  // Sequencial: o cliente da transação usa uma única conexão.
  for (const c of contas) total = total.add(await saldoDaContaAte(db, c.id, data));
  return total;
}

/** Junta os dados agregados do mês e monta a foto. Só consultas sem relações de pessoa/conta. */
async function construirSnapshot(db: Db, ano: number, mes: number): Promise<SnapshotPrestacao> {
  const p = periodo(ano, mes);
  const config = await db.configuracao.findFirst({ orderBy: { criadoEm: "asc" }, select: { nomeIgreja: true, logoUrl: true } });
  if (!config) throw new NaoEncontrado("Configuração não encontrada");

  const noPeriodo = { status: StatusLancamento.REALIZADO, dataRealizacao: { gte: p.inicio, lte: p.dataCorte } };
  const grupos = await db.lancamento.groupBy({
    by: ["categoriaId", "tipo"],
    where: noPeriodo,
    orderBy: [{ categoriaId: "asc" }, { tipo: "asc" }],
    _sum: { valor: true },
  });
  const categorias = grupos.length
    ? await db.categoria.findMany({
        where: { id: { in: [...new Set(grupos.map((g) => g.categoriaId))] } },
        select: { id: true, nome: true, detalharPublico: true },
      })
    : [];
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const detalhadas = categorias.filter((c) => c.detalharPublico).map((c) => c.id);
  const itens = detalhadas.length
    ? await db.lancamento.findMany({
        where: { ...noPeriodo, tipo: TipoMovimento.SAIDA, categoriaId: { in: detalhadas } },
        select: { categoriaId: true, dataRealizacao: true, descricao: true, valor: true },
        orderBy: [{ dataRealizacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
      })
    : [];
  const saldoFimMes = await saldoTotalEm(db, p.dataCorte);

  const dados: DadosSnapshot = {
    igreja: { nome: config.nomeIgreja, logoUrl: urlHttp(config.logoUrl) },
    ano: p.ano,
    mes: p.mes,
    dataCorte: p.dataCorte,
    parcial: p.parcial,
    saldoFimMes,
    entradas: [],
    saidas: [],
  };
  for (const g of grupos) {
    const c = porId.get(g.categoriaId);
    const total = g._sum?.valor ?? ZERO();
    if (g.tipo === TipoMovimento.ENTRADA) {
      dados.entradas.push({ categoria: c?.nome ?? "", total });
    } else {
      dados.saidas.push({
        categoria: c?.nome ?? "",
        total,
        detalharPublico: c?.detalharPublico ?? false,
        itens: itens
          .filter((i) => i.categoriaId === g.categoriaId)
          .map((i) => ({ data: i.dataRealizacao ?? p.dataCorte, descricao: i.descricao, valor: i.valor })),
      });
    }
  }
  return montarSnapshot(dados);
}

/** Prévia exatamente como o membro verá; não grava nada. */
export async function previaPrestacao(ator: UsuarioAtual | null, ano: number, mes: number): Promise<SnapshotPrestacao> {
  exigir(ator, "financeiro.ver");
  return construirSnapshot(prisma, ano, mes);
}

/** Grava a versão N+1 do mês com token novo; versões anteriores continuam acessíveis. */
export async function publicarPrestacao(ator: UsuarioAtual | null, ano: number, mes: number): Promise<PrestacaoPublicada> {
  const quem = exigir(ator, "financeiro.lancar");
  periodo(ano, mes); // valida antes de abrir a transação
  // O snapshot é só leitura: monta-se antes da trava, para ela cobrir apenas versão, token e insert.
  const snapshot = await construirSnapshot(prisma, ano, mes);
  return prisma.$transaction(async (tx) => {
    // Serializa as publicações: a próxima versão é lida sob a trava.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRAVA_PRESTACAO})`;
    const ultima = await tx.prestacaoContas.aggregate({ where: { ano, mes }, _max: { versao: true } });
    const versao = (ultima._max.versao ?? 0) + 1;
    const token = randomBytes(32).toString("base64url");
    const criada = await tx.prestacaoContas.create({
      data: { ano, mes, versao, token, dados: snapshot as unknown as Prisma.InputJsonValue, publicadaPorId: quem.id },
      select: { id: true },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "PrestacaoContas",
      entidadeId: criada.id,
      acao: "PUBLICOU",
      valorNovo: `${String(mes).padStart(2, "0")}/${ano} v${versao}`,
    });
    await rastrearServidor(tx, quem, "prestacao_publicada", { versao });
    return { id: criada.id, ano, mes, versao, token, snapshot };
  });
}

/** Retira uma versão do ar (o link passa a mostrar "retirada"). Nada é apagado. */
export async function despublicarPrestacao(ator: UsuarioAtual | null, id: string, motivo: string): Promise<void> {
  const quem = exigir(ator, "financeiro.lancar");
  const pid = validar(esquemaId(MSG_PRESTACAO_NAO_ENCONTRADA), id, { campo: "prestacao" });
  const m = validar(esquemaMotivoRetirada, motivo, { campo: "motivo" });
  await prisma.$transaction(async (tx) => {
    const atual = await tx.prestacaoContas.findUnique({ where: { id: pid }, select: { despublicada: true } });
    if (!atual) throw new NaoEncontrado(MSG_PRESTACAO_NAO_ENCONTRADA);
    if (atual.despublicada) throw new RegraDeNegocio(MSG_JA_DESPUBLICADA);
    // Condicional: duas despublicações simultâneas não registram dois logs.
    const r = await tx.prestacaoContas.updateMany({
      where: { id: pid, despublicada: false },
      data: { despublicada: true, despublicadaEm: new Date() },
    });
    if (r.count === 0) throw new RegraDeNegocio(MSG_JA_DESPUBLICADA);
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "PrestacaoContas",
      entidadeId: pid,
      acao: "DESPUBLICOU",
      campo: "despublicada",
      valorNovo: m,
    });
  });
}

export async function listarPrestacoes(ator: UsuarioAtual | null, filtro: { ano?: number } = {}): Promise<PrestacaoListada[]> {
  exigir(ator, "financeiro.ver");
  const f = validar(esquemaFiltroLista, { ano: filtro.ano }, { campo: "ano" });
  const linhas = await prisma.prestacaoContas.findMany({
    where: f.ano === undefined ? {} : { ano: f.ano },
    select: {
      id: true,
      ano: true,
      mes: true,
      versao: true,
      token: true,
      publicadaEm: true,
      visualizacoes: true,
      despublicada: true,
      despublicadaEm: true,
      publicadaPor: { select: { nome: true } },
    },
    orderBy: [{ ano: "desc" }, { mes: "desc" }, { versao: "desc" }],
  });
  return linhas.map(({ publicadaPor, ...l }) => ({ ...l, publicadaPor: publicadaPor.nome }));
}

/**
 * Leitura pública (sem ator). Token fora do formato → 'inexistente' sem consultar o banco.
 * Só o estado 'ok' conta visualização (incremento atômico).
 */
export async function abrirPrestacaoPublica(token: string): Promise<PrestacaoAberta> {
  if (typeof token !== "string" || !FORMATO_TOKEN.test(token)) return { estado: "inexistente" };
  const p = await prisma.prestacaoContas.findUnique({
    where: { token },
    select: { id: true, ano: true, mes: true, versao: true, dados: true, publicadaEm: true, despublicada: true },
  });
  if (!p) return { estado: "inexistente" };
  if (p.despublicada) return { estado: "despublicada" };

  const contou = await prisma.prestacaoContas.updateMany({
    where: { id: p.id, despublicada: false },
    data: { visualizacoes: { increment: 1 } },
  });
  if (contou.count === 0) return { estado: "despublicada" };

  const maisRecente = await prisma.prestacaoContas.findFirst({
    where: { ano: p.ano, mes: p.mes, despublicada: false, versao: { gt: p.versao } },
    select: { versao: true, token: true },
    orderBy: { versao: "desc" },
  });
  return {
    estado: "ok",
    snapshot: p.dados as unknown as SnapshotPrestacao,
    versao: p.versao,
    publicadaEm: dataSP(p.publicadaEm),
    ...(maisRecente ? { versaoMaisRecente: maisRecente } : {}),
  };
}
