// Lançamentos financeiros: criar, editar, dar baixa, cancelar, ler e listar.
import { Prisma, StatusLancamento, TipoMovimento } from "@prisma/client";
import type { Lancamento, Papel } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarDataBR } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio } from "@/lib/erros";
import { diffCampos, registrarLog } from "@/lib/log";
import { rastrearServidor } from "./metricas";
import {
  esquemaData,
  esquemaDataOpcional,
  esquemaId,
  esquemaMotivo,
  esquemaTextoOpcional,
  esquemaValor,
  validar,
} from "./comum";

export const MSG_LANCAMENTO_NAO_ENCONTRADO = "Lançamento não encontrado";
export const MSG_CANCELADO = "Lançamento cancelado não pode ser alterado";
export const MSG_JA_REALIZADO = "Lançamento já realizado";
export const MSG_CONFLITO = "O lançamento foi alterado por outra pessoa. Recarregue e tente novamente";
export const NOME_MASCARADO = "Contribuição nominal";
export const ITENS_POR_PAGINA = 20;

export type DadosLancamento = {
  tipo: TipoMovimento;
  valor: string;
  categoriaId: string;
  contaId: string;
  membroId?: string | null;
  descricao?: string;
  dataVencimento: string;
  realizado: boolean;
  dataRealizacao?: string;
};

export type FiltroLancamentos = {
  de?: string;
  ate?: string;
  tipo?: TipoMovimento;
  categoriaId?: string;
  contaId?: string;
  status?: StatusLancamento;
  membroId?: string;
  busca?: string;
  pagina?: number;
};

// ------------------------------------------------------------- Validação

const enumDe = <T extends string>(o: Record<string, T>, msg: string) =>
  z.enum(Object.values(o) as [T, ...T[]], { error: msg });

const esquemaDados = z.object({
  tipo: enumDe(TipoMovimento, "Tipo de lançamento inválido"),
  valor: esquemaValor,
  categoriaId: esquemaId("Informe a categoria"),
  contaId: esquemaId("Informe a conta"),
  membroId: z
    .string({ error: "Membro inválido" })
    .trim()
    .nullable()
    .optional()
    .transform((t) => (t ? t : null)),
  descricao: z
    .string({ error: "Descrição inválida" })
    .trim()
    .optional()
    .transform((t) => (t ? t : null)),
  dataVencimento: esquemaData,
  realizado: z.boolean({ error: "Informe se o lançamento já foi realizado" }),
  dataRealizacao: esquemaDataOpcional,
});
type DadosValidos = z.output<typeof esquemaDados>;

/** Chaves do esquema → nomes dos campos do formulário (para `ErroApp.campo`). */
const CAMPOS_FORM = { categoriaId: "categoria", contaId: "conta", membroId: "membro" };

const esquemaFiltro = z.object({
  de: esquemaDataOpcional,
  ate: esquemaDataOpcional,
  tipo: enumDe(TipoMovimento, "Tipo de lançamento inválido").optional(),
  categoriaId: esquemaTextoOpcional,
  contaId: esquemaTextoOpcional,
  status: enumDe(StatusLancamento, "Status inválido").optional(),
  membroId: esquemaTextoOpcional,
  busca: esquemaTextoOpcional,
  pagina: z.number({ error: "Página inválida" }).int("Página inválida").min(1, "Página inválida").default(1),
});

// ---------------------------------------------------- Vínculos e regras

type Vinculos = { categoria: string; conta: string; membro: string | null };

/**
 * Carrega categoria/conta/membro e aplica as regras de coerência.
 * `anterior` (edição): um vínculo inativo só é recusado se foi trocado.
 */
async function conferirVinculos(
  tx: Prisma.TransactionClient,
  v: DadosValidos,
  anterior?: Pick<Lancamento, "categoriaId" | "contaId" | "membroId">,
): Promise<Vinculos> {
  // Sequencial: o cliente da transação usa uma única conexão.
  const categoria = await tx.categoria.findUnique({ where: { id: v.categoriaId } });
  const conta = await tx.conta.findUnique({ where: { id: v.contaId } });
  const membro = v.membroId ? await tx.membro.findUnique({ where: { id: v.membroId } }) : null;
  if (!categoria) throw new NaoEncontrado("Categoria não encontrada", { campo: "categoria", regra: "inexistente" });
  if (!conta) throw new NaoEncontrado("Conta não encontrada", { campo: "conta", regra: "inexistente" });
  if (v.membroId && !membro) throw new NaoEncontrado("Membro não encontrado", { campo: "membro", regra: "inexistente" });

  if (categoria.tipo !== v.tipo) throw new RegraDeNegocio("Categoria não corresponde ao tipo do lançamento", { campo: "categoria", regra: "tipo_incompativel" });
  if (categoria.nominal && !membro) throw new RegraDeNegocio("Esta categoria exige um membro", { campo: "membro", regra: "obrigatorio" });
  if (!categoria.nominal && membro) throw new RegraDeNegocio("Esta categoria não aceita membro", { campo: "membro", regra: "nao_aceita" });

  const trocou = (campo: "categoriaId" | "contaId" | "membroId", novo: string | null) =>
    !anterior || anterior[campo] !== novo;
  if (!categoria.ativa && trocou("categoriaId", categoria.id)) throw new RegraDeNegocio("Categoria inativa", { campo: "categoria", regra: "inativo" });
  if (!conta.ativa && trocou("contaId", conta.id)) throw new RegraDeNegocio("Conta inativa", { campo: "conta", regra: "inativo" });
  if (membro && !membro.ativo && trocou("membroId", membro.id)) throw new RegraDeNegocio("Membro inativo", { campo: "membro", regra: "inativo" });

  return { categoria: categoria.nome, conta: conta.nome, membro: membro?.nome ?? null };
}

/** Status e data de realização a gravar a partir do formulário. */
function situacao(v: DadosValidos, anterior?: Lancamento) {
  if (!v.realizado) return { status: StatusLancamento.PREVISTO, dataRealizacao: null };
  const jaRealizada = anterior?.status === StatusLancamento.REALIZADO ? anterior.dataRealizacao : null;
  return {
    status: StatusLancamento.REALIZADO,
    dataRealizacao: v.dataRealizacao ?? jaRealizada ?? v.dataVencimento,
  };
}

type CamposLegiveis = Pick<Lancamento, "tipo" | "valor" | "descricao" | "dataVencimento" | "dataRealizacao" | "status">;

/** Valores como aparecem no histórico (nomes, R$, dd/mm/aaaa). */
function textoLancamento(l: CamposLegiveis, n: Vinculos): Record<string, string | null> {
  return {
    tipo: l.tipo,
    valor: formatarBRL(l.valor),
    categoria: n.categoria,
    conta: n.conta,
    membro: n.membro,
    descricao: l.descricao,
    dataVencimento: formatarDataBR(l.dataVencimento),
    dataRealizacao: l.dataRealizacao ? formatarDataBR(l.dataRealizacao) : null,
    status: l.status,
  };
}

async function carregar(tx: Prisma.TransactionClient, id: string): Promise<Lancamento> {
  const l = await tx.lancamento.findUnique({ where: { id } });
  if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);
  return l;
}

async function carregarAlteravel(tx: Prisma.TransactionClient, id: string): Promise<Lancamento> {
  const l = await carregar(tx, id);
  if (l.status === StatusLancamento.CANCELADO) throw new RegraDeNegocio(MSG_CANCELADO);
  return l;
}

/**
 * Update condicional contra atualização perdida: só grava se o registro
 * ainda está como foi lido. Se outra transação mudou antes, relê e explica.
 */
async function gravarSeInalterado(
  tx: Prisma.TransactionClient,
  atual: Lancamento,
  data: Prisma.LancamentoUncheckedUpdateManyInput,
): Promise<Lancamento> {
  const r = await tx.lancamento.updateMany({
    where: { id: atual.id, status: atual.status, atualizadoEm: atual.atualizadoEm },
    data,
  });
  if (r.count !== 1) {
    const agora = await carregar(tx, atual.id);
    if (agora.status === StatusLancamento.CANCELADO) throw new RegraDeNegocio(MSG_CANCELADO);
    if (agora.status === StatusLancamento.REALIZADO && atual.status === StatusLancamento.PREVISTO) {
      throw new RegraDeNegocio(MSG_JA_REALIZADO);
    }
    throw new RegraDeNegocio(MSG_CONFLITO);
  }
  return carregar(tx, atual.id);
}

// ------------------------------------------------------------- Escrita

export async function criarLancamento(ator: UsuarioAtual | null, d: DadosLancamento): Promise<Lancamento> {
  const quem = exigir(ator, "financeiro.lancar");
  const v = validar(esquemaDados, d, { campos: CAMPOS_FORM });
  return prisma.$transaction(async (tx) => {
    const nomes = await conferirVinculos(tx, v);
    const l = await tx.lancamento.create({
      data: {
        tipo: v.tipo,
        valor: v.valor,
        descricao: v.descricao,
        categoriaId: v.categoriaId,
        contaId: v.contaId,
        membroId: v.membroId,
        dataVencimento: v.dataVencimento,
        ...situacao(v),
        criadoPorId: quem.id,
      },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Lancamento",
      entidadeId: l.id,
      acao: "CRIOU",
      valorNovo: `${nomes.categoria} — ${formatarBRL(l.valor)}`,
    });
    return l;
  });
}

export async function editarLancamento(ator: UsuarioAtual | null, id: string, d: DadosLancamento): Promise<Lancamento> {
  const quem = exigir(ator, "financeiro.lancar");
  const v = validar(esquemaDados, d, { campos: CAMPOS_FORM });
  return prisma.$transaction(async (tx) => {
    const atual = await carregarAlteravel(tx, id);
    const nomesAntes = await nomesDosVinculos(tx, atual);
    const nomesDepois = await conferirVinculos(tx, v, atual);
    const novo = {
      tipo: v.tipo,
      valor: v.valor,
      descricao: v.descricao,
      categoriaId: v.categoriaId,
      contaId: v.contaId,
      membroId: v.membroId,
      dataVencimento: v.dataVencimento,
      ...situacao(v, atual),
    };
    const mudancas = diffCampos(textoLancamento(atual, nomesAntes), textoLancamento(novo, nomesDepois));
    if (mudancas.length === 0) return atual;
    const salvo = await gravarSeInalterado(tx, atual, { ...novo, atualizadoPorId: quem.id });
    for (const m of mudancas) {
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Lancamento",
        entidadeId: id,
        acao: "ALTEROU",
        campo: m.campo,
        valorAnterior: m.de ?? undefined,
        valorNovo: m.para ?? undefined,
      });
    }
    return salvo;
  });
}

async function nomesDosVinculos(tx: Prisma.TransactionClient, l: Lancamento): Promise<Vinculos> {
  const categoria = await tx.categoria.findUniqueOrThrow({ where: { id: l.categoriaId }, select: { nome: true } });
  const conta = await tx.conta.findUniqueOrThrow({ where: { id: l.contaId }, select: { nome: true } });
  const membro = l.membroId
    ? await tx.membro.findUniqueOrThrow({ where: { id: l.membroId }, select: { nome: true } })
    : null;
  return { categoria: categoria.nome, conta: conta.nome, membro: membro?.nome ?? null };
}

export async function darBaixa(ator: UsuarioAtual | null, id: string, dataRealizacao: string): Promise<Lancamento> {
  const quem = exigir(ator, "financeiro.lancar");
  const data = validar(esquemaData, dataRealizacao, { campo: "dataRealizacao" });
  return prisma.$transaction(async (tx) => {
    const atual = await carregarAlteravel(tx, id);
    if (atual.status === StatusLancamento.REALIZADO) throw new RegraDeNegocio(MSG_JA_REALIZADO);
    const salvo = await gravarSeInalterado(tx, atual, {
      status: StatusLancamento.REALIZADO,
      dataRealizacao: data,
      atualizadoPorId: quem.id,
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Lancamento",
      entidadeId: id,
      acao: "DEU_BAIXA",
      campo: "dataRealizacao",
      valorNovo: formatarDataBR(data),
    });
    await rastrearServidor(tx, quem, "baixa_dada");
    return salvo;
  });
}

export async function cancelarLancamento(ator: UsuarioAtual | null, id: string, motivo: string): Promise<Lancamento> {
  const quem = exigir(ator, "financeiro.lancar");
  const m = validar(esquemaMotivo, motivo, { campo: "motivo" });
  return prisma.$transaction(async (tx) => {
    const atual = await carregarAlteravel(tx, id);
    const salvo = await gravarSeInalterado(tx, atual, {
      status: StatusLancamento.CANCELADO,
      motivoCancelamento: m,
      atualizadoPorId: quem.id,
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Lancamento",
      entidadeId: id,
      acao: "CANCELOU",
      campo: "status",
      valorAnterior: atual.status,
      valorNovo: m,
    });
    await rastrearServidor(tx, quem, "lancamento_cancelado");
    return salvo;
  });
}

// -------------------------------------------------------------- Leitura

/** Esconde o nome do membro de quem não tem `membros.ver_nomes`. Não altera o objeto recebido. */
export function mascararMembro<T extends { membro: { nome: string } | null }>(l: T, papeis: Papel[]): T {
  if (!l.membro || pode(papeis, "membros.ver_nomes")) return l;
  return { ...l, membro: { ...l.membro, nome: NOME_MASCARADO } };
}

const incluirListagem = {
  categoria: { select: { id: true, nome: true, tipo: true, nominal: true, ativa: true } },
  conta: { select: { id: true, nome: true, tipo: true, ativa: true } },
  membro: { select: { id: true, nome: true } },
} satisfies Prisma.LancamentoInclude;

const incluirDetalhe = {
  ...incluirListagem,
  anexos: { orderBy: { criadoEm: "asc" } },
} satisfies Prisma.LancamentoInclude;

export type LancamentoListado = Prisma.LancamentoGetPayload<{ include: typeof incluirListagem }>;
export type LancamentoDetalhado = Prisma.LancamentoGetPayload<{ include: typeof incluirDetalhe }>;

export async function obterLancamento(ator: UsuarioAtual | null, id: string): Promise<LancamentoDetalhado> {
  const quem = exigir(ator, "financeiro.ver");
  const l = await prisma.lancamento.findUnique({ where: { id }, include: incluirDetalhe });
  if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);
  return mascararMembro(l, quem.papeis);
}

function montarWhere(f: z.output<typeof esquemaFiltro>): Prisma.LancamentoWhereInput {
  const e: Prisma.LancamentoWhereInput[] = [];
  e.push({ status: f.status ?? { not: StatusLancamento.CANCELADO } });
  if (f.tipo) e.push({ tipo: f.tipo });
  if (f.categoriaId) e.push({ categoriaId: f.categoriaId });
  if (f.contaId) e.push({ contaId: f.contaId });
  if (f.membroId) e.push({ membroId: f.membroId });
  if (f.busca) e.push({ descricao: { contains: f.busca, mode: "insensitive" } });
  if (f.de || f.ate) {
    const faixa: Prisma.DateTimeFilter = { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) };
    // Data efetiva: realização quando REALIZADO, senão vencimento.
    e.push({
      OR: [
        { status: StatusLancamento.REALIZADO, dataRealizacao: faixa },
        { status: { not: StatusLancamento.REALIZADO }, dataVencimento: faixa },
      ],
    });
  }
  return { AND: e };
}

export async function listarLancamentos(
  ator: UsuarioAtual | null,
  filtro: FiltroLancamentos,
): Promise<{ itens: LancamentoListado[]; total: number; somaEntradas: Prisma.Decimal; somaSaidas: Prisma.Decimal }> {
  const quem = exigir(ator, "financeiro.ver");
  const f = validar(esquemaFiltro, filtro ?? {});
  const where = montarWhere(f);
  // Consultas independentes no pool (fora de transação: em READ COMMITTED ela
  // não daria um snapshot único e faria o Prisma enfileirar queries numa só conexão).
  const [itens, total, somas] = await Promise.all([
    prisma.lancamento.findMany({
      where,
      include: incluirListagem,
      orderBy: [{ dataVencimento: "desc" }, { criadoEm: "desc" }, { id: "desc" }],
      skip: (f.pagina - 1) * ITENS_POR_PAGINA,
      take: ITENS_POR_PAGINA,
    }),
    prisma.lancamento.count({ where }),
    prisma.lancamento.groupBy({ by: ["tipo"], where, orderBy: { tipo: "asc" }, _sum: { valor: true } }),
  ]);
  const soma = (t: TipoMovimento) =>
    somas.find((s) => s.tipo === t)?._sum?.valor ?? new Prisma.Decimal(0);
  return {
    itens: itens.map((l) => mascararMembro(l, quem.papeis)),
    total,
    somaEntradas: soma(TipoMovimento.ENTRADA),
    somaSaidas: soma(TipoMovimento.SAIDA),
  };
}
