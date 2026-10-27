// Recibo eletrônico de contribuição nominal: número sequencial por ano, fixo por lançamento.
import { createHash } from "node:crypto";
import { Prisma, StatusLancamento } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { dataPorExtenso, formatarDataBR } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio } from "@/lib/erros";
import { valorPorExtenso } from "@/lib/extenso";
import { registrarLog } from "@/lib/log";
import { MSG_LANCAMENTO_NAO_ENCONTRADO } from "./lancamentos";
import { esquemaId, validar } from "./comum";

export const MSG_RECIBO_INDISPONIVEL = "Recibo disponível apenas para contribuições nominais realizadas";
export const MSG_RECIBO_NAO_ENCONTRADO = "Recibo não encontrado";

/** Chave do `pg_advisory_xact_lock` que serializa a numeração dos recibos. */
const TRAVA_RECIBO = 4244;

export type DadosRecibo = {
  numeroFormatado: string;
  codigoVerificacao: string;
  igreja: { nome: string; cnpj: string | null; logoUrl: string | null; cidade: string | null };
  membro: string;
  /** "R$ 1.234,56" */
  valor: string;
  valorExtenso: string;
  categoria: string;
  /** dd/mm/aaaa */
  dataRealizacao: string;
  /** "27 de outubro de 2026" */
  dataPorExtenso: string;
  /** Quem fez a primeira emissão. */
  emitidoPor: string;
  cancelado: boolean;
};

const incluirRecibo = {
  categoria: { select: { nome: true, nominal: true } },
  membro: { select: { nome: true } },
  recibo: { include: { emitidoPor: { select: { nome: true } } } },
} satisfies Prisma.LancamentoInclude;

type LancamentoComRecibo = Prisma.LancamentoGetPayload<{ include: typeof incluirRecibo }>;

export const formatarNumeroRecibo = (ano: number, numero: number) => `${ano}/${String(numero).padStart(6, "0")}`;

/** 8 primeiros hex do SHA-256 de `${ano}/${numero}:${lancamentoId}`. */
export const codigoVerificacao = (ano: number, numero: number, lancamentoId: string) =>
  createHash("sha256").update(`${ano}/${numero}:${lancamentoId}`).digest("hex").slice(0, 8);

const urlHttp = (t: string | null) => (t && /^https?:\/\//i.test(t) ? t : null);

async function carregar(id: string): Promise<LancamentoComRecibo> {
  const l = await prisma.lancamento.findUnique({ where: { id }, include: incluirRecibo });
  if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);
  return l;
}

async function montar(l: LancamentoComRecibo): Promise<DadosRecibo> {
  const r = l.recibo;
  // Só chega aqui com recibo emitido, e só se emite para nominal realizado (membro e data presentes).
  if (!r || !l.membro || !l.dataRealizacao) throw new NaoEncontrado(MSG_RECIBO_NAO_ENCONTRADO);
  const config = await prisma.configuracao.findFirst({ orderBy: { criadoEm: "asc" } });
  if (!config) throw new NaoEncontrado("Configuração não encontrada");
  return {
    numeroFormatado: formatarNumeroRecibo(r.ano, r.numero),
    codigoVerificacao: r.codigoVerificacao,
    igreja: {
      nome: config.nomeIgreja,
      cnpj: config.cnpj ?? null,
      logoUrl: urlHttp(config.logoUrl),
      cidade: config.cidade ?? null,
    },
    membro: l.membro.nome,
    valor: formatarBRL(l.valor),
    valorExtenso: valorPorExtenso(l.valor),
    categoria: l.categoria.nome,
    dataRealizacao: formatarDataBR(l.dataRealizacao),
    dataPorExtenso: dataPorExtenso(l.dataRealizacao),
    emitidoPor: r.emitidoPor.nome,
    cancelado: l.status === StatusLancamento.CANCELADO,
  };
}

function exigirPermissoes(ator: UsuarioAtual | null): UsuarioAtual {
  const quem = exigir(ator, "financeiro.lancar");
  // O recibo revela o nome do membro.
  return exigir(quem, "membros.ver_nomes");
}

const validarId = (id: string) =>
  validar(esquemaId(MSG_LANCAMENTO_NAO_ENCONTRADO), id, { campo: "lancamento" });

/**
 * Emite o recibo (primeira vez: novo número no ano da realização) ou devolve o já emitido
 * (mesmo número; registra a reemissão no histórico do lançamento).
 */
export async function emitirRecibo(ator: UsuarioAtual | null, lancamentoId: string): Promise<DadosRecibo> {
  const quem = exigirPermissoes(ator);
  const id = validarId(lancamentoId);

  await prisma.$transaction(async (tx) => {
    // Serializa as emissões: a sequência por ano e o "já tem recibo?" são lidos sob a trava.
    // Só consultas sem `include` aqui: o Prisma dispara as de relação em paralelo na mesma conexão.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRAVA_RECIBO})`;
    const l = await tx.lancamento.findUnique({ where: { id } });
    if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);

    const existente = await tx.recibo.findUnique({ where: { lancamentoId: id }, select: { id: true } });
    if (existente) {
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Lancamento",
        entidadeId: id,
        acao: "EMITIU_RECIBO",
        valorNovo: "Reemissão",
      });
      return;
    }

    const categoria = await tx.categoria.findUniqueOrThrow({ where: { id: l.categoriaId }, select: { nominal: true } });
    if (l.status !== StatusLancamento.REALIZADO || !categoria.nominal || !l.membroId || !l.dataRealizacao) {
      throw new RegraDeNegocio(MSG_RECIBO_INDISPONIVEL);
    }

    const ano = l.dataRealizacao.getUTCFullYear();
    const [seq] = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO "SequenciaRecibo" ("ano", "ultimo") VALUES (${ano}, 1)
      ON CONFLICT ("ano") DO UPDATE SET "ultimo" = "SequenciaRecibo"."ultimo" + 1
      RETURNING "ultimo"`;
    const numero = Number(seq.ultimo);

    await tx.recibo.create({
      data: {
        lancamentoId: id,
        ano,
        numero,
        codigoVerificacao: codigoVerificacao(ano, numero, id),
        emitidoPorId: quem.id,
      },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Lancamento",
      entidadeId: id,
      acao: "EMITIU_RECIBO",
      valorNovo: formatarNumeroRecibo(ano, numero),
    });
  });

  // O recibo é imutável; o resto (status, igreja) é lido já fora da transação.
  return montar(await carregar(id));
}

/** Dados de um recibo já emitido (sem log); `cancelado` reflete o status atual do lançamento. */
export async function dadosRecibo(ator: UsuarioAtual | null, lancamentoId: string): Promise<DadosRecibo> {
  exigirPermissoes(ator);
  const id = validarId(lancamentoId);
  const l = await carregar(id);
  if (!l.recibo) throw new NaoEncontrado(MSG_RECIBO_NAO_ENCONTRADO);
  return montar(l);
}
