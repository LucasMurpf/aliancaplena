// Calculadora de cédulas: conferência de culto e de caixa (registra; não cria lançamento).
import { ModoContagem, Prisma, StatusLancamento, TipoMovimento } from "@prisma/client";
import type { ContagemCaixa } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarBRL, VALOR_MAXIMO } from "@/lib/dinheiro";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { PAGINA_MAXIMA } from "@/lib/paginacao";
import { rastrearServidor } from "./metricas";
import { saldoDaConta } from "./resumo";
import { esquemaDataOpcional, esquemaId, esquemaTextoOpcional, esquemaValor, validar } from "./comum";

export const MSG_CONTAGEM_NAO_ENCONTRADA = "Contagem não encontrada";
export const MSG_SEM_QUANTIDADE = "Informe ao menos uma quantidade ou um Pix";
export const MSG_PIX_ACIMA_LIMITE = "A soma dos Pix passou do limite permitido";
export const PIX_MAXIMOS = 500;
export const MSG_OBSERVACAO_DIVERGENCIA = "Explique a diferença na observação";
export const ITENS_POR_PAGINA_CONTAGENS = 20;
export const QUANTIDADE_MAXIMA = 100_000;

export type Denominacao = { centavos: number; rotulo: string; tipo: "cedula" | "moeda" };

const denominacao = (centavos: number, tipo: Denominacao["tipo"]): Denominacao => ({
  centavos,
  rotulo: formatarBRL(new Prisma.Decimal(centavos).div(100)),
  tipo,
});

/** Em ordem decrescente: cédulas de R$ 200 a R$ 2, moedas de R$ 1,00 a R$ 0,01. */
export const DENOMINACOES: readonly Denominacao[] = Object.freeze([
  ...[20000, 10000, 5000, 2000, 1000, 500, 200].map((c) => denominacao(c, "cedula")),
  ...[100, 50, 25, 10, 5, 1].map((c) => denominacao(c, "moeda")),
]);
const POR_CENTAVOS = new Map(DENOMINACOES.map((d) => [d.centavos, d]));

export type ItemContagem = { denominacaoCentavos: number; quantidade: number };

export type DadosEsperado = { modo: ModoContagem; contaId: string; data?: string };

/** `pix`: um valor em reais por Pix recebido, como digitado ("12,50"). */
export type DadosContagem = DadosEsperado & { itens: ItemContagem[]; pix?: string[]; observacao?: string };

export type FiltroContagens = { contaId?: string; de?: string; ate?: string; pagina?: number };

export type ContagemListada = {
  id: string;
  modo: ModoContagem;
  contaId: string;
  conta: string;
  /** dd/mm/aaaa no CULTO; null no CAIXA (a conferência é do saldo no momento). */
  data: string | null;
  /** Total em espécie (cédulas e moedas): é o que se compara com o esperado. */
  totalContado: Prisma.Decimal;
  totalPix: Prisma.Decimal;
  esperado: Prisma.Decimal;
  diferenca: Prisma.Decimal;
  observacao: string | null;
  criadoPor: string;
  criadoEm: Date;
};

export type ItemContagemDetalhado = ItemContagem & {
  rotulo: string;
  tipo: Denominacao["tipo"];
  subtotal: Prisma.Decimal;
};

export type ContagemDetalhada = ContagemListada & { itens: ItemContagemDetalhado[]; pix: Prisma.Decimal[] };

// ------------------------------------------------------------- Validação

const esquemaItens = z
  .array(
    z.object({
      denominacaoCentavos: z
        .number({ error: "Denominação inválida" })
        .refine((c) => POR_CENTAVOS.has(c), "Denominação inválida"),
      quantidade: z
        .number({ error: "Quantidade inválida" })
        .int("Quantidade inválida")
        .min(0, "Quantidade inválida")
        .max(QUANTIDADE_MAXIMA, "Quantidade inválida"),
    }),
    { error: "Itens inválidos" },
  )
  .superRefine((itens, ctx) => {
    const vistos = new Set<number>();
    for (const i of itens) {
      if (vistos.has(i.denominacaoCentavos)) {
        ctx.addIssue({ code: "custom", message: "Denominação repetida", params: { regra: "repetida" } });
        return;
      }
      vistos.add(i.denominacaoCentavos);
    }
  });

const esquemaModo = z.enum(Object.values(ModoContagem) as [ModoContagem, ...ModoContagem[]], {
  error: "Modo de contagem inválido",
});

const esquemaEsperado = z.object({
  modo: esquemaModo,
  contaId: esquemaId("Informe a conta"),
  data: esquemaDataOpcional,
});

const esquemaContagem = esquemaEsperado.extend({
  itens: esquemaItens,
  pix: z.array(esquemaValor, { error: "Pix inválido" }).max(PIX_MAXIMOS, "Pix demais nesta contagem").optional(),
  observacao: esquemaTextoOpcional,
});

const CAMPOS_FORM = { contaId: "conta" };

const esquemaFiltro = z.object({
  contaId: esquemaTextoOpcional,
  de: esquemaDataOpcional,
  ate: esquemaDataOpcional,
  pagina: z
    .number({ error: "Página inválida" })
    .int("Página inválida")
    .min(1, "Página inválida")
    .max(PAGINA_MAXIMA, "Página inválida")
    .default(1),
});

/** CULTO: a data informada (padrão hoje, nunca futura). CAIXA: sempre hoje. */
function dataDaContagem(modo: ModoContagem, data: Date | undefined): Date {
  const hoje = hojeSP();
  if (modo === ModoContagem.CAIXA || !data) return hoje;
  if (data > hoje) throw new Validacao("A data não pode ser futura", { campo: "data", regra: "futura" });
  return data;
}

// --------------------------------------------------------------- Cálculo

const somarItens = (itens: ItemContagem[]) =>
  itens.reduce(
    (acc, i) => acc.add(new Prisma.Decimal(i.denominacaoCentavos).mul(i.quantidade)),
    new Prisma.Decimal(0),
  ).div(100);

/** Total em reais. Puro; quantidades inteiras de 0 a 100000, denominações da lista, sem repetição. */
export function calcularTotal(itens: ItemContagem[]): Prisma.Decimal {
  return somarItens(validar(z.object({ itens: esquemaItens }), { itens }).itens);
}

async function esperadoNa(
  db: Prisma.TransactionClient | typeof prisma,
  modo: ModoContagem,
  contaId: string,
  data: Date,
): Promise<Prisma.Decimal> {
  if (modo === ModoContagem.CAIXA) return saldoDaConta(db, contaId);
  const r = await db.lancamento.aggregate({
    where: { contaId, tipo: TipoMovimento.ENTRADA, status: StatusLancamento.REALIZADO, dataRealizacao: data },
    _sum: { valor: true },
  });
  return r._sum.valor ?? new Prisma.Decimal(0);
}

/** CULTO: Σ entradas REALIZADAS da conta no dia. CAIXA: saldo atual da conta. */
export async function valorEsperado(ator: UsuarioAtual | null, d: DadosEsperado): Promise<Prisma.Decimal> {
  exigir(ator, "financeiro.ver");
  const v = validar(esquemaEsperado, d, { campos: CAMPOS_FORM });
  const data = dataDaContagem(v.modo, v.data);
  const conta = await prisma.conta.findUnique({ where: { id: v.contaId }, select: { id: true } });
  if (!conta) throw new NaoEncontrado("Conta não encontrada");
  return esperadoNa(prisma, v.modo, v.contaId, data);
}

// ------------------------------------------------------------- Registro

export async function registrarContagem(ator: UsuarioAtual | null, d: DadosContagem): Promise<ContagemCaixa> {
  const quem = exigir(ator, "financeiro.lancar");
  const v = validar(esquemaContagem, d, { campos: CAMPOS_FORM });
  const data = dataDaContagem(v.modo, v.data);
  const itens = v.itens.filter((i) => i.quantidade > 0);
  const pix = v.pix ?? [];
  if (itens.length === 0 && pix.length === 0) throw new Validacao(MSG_SEM_QUANTIDADE, { campo: "itens", regra: "obrigatorio" });
  const totalContado = somarItens(itens);
  const totalPix = pix.reduce((acc, p) => acc.add(p), new Prisma.Decimal(0));
  if (totalPix.gt(VALOR_MAXIMO)) throw new Validacao(MSG_PIX_ACIMA_LIMITE, { campo: "pix", regra: "acima_limite" });

  return prisma.$transaction(async (tx) => {
    const conta = await tx.conta.findUnique({ where: { id: v.contaId }, select: { ativa: true } });
    if (!conta) throw new NaoEncontrado("Conta não encontrada");
    if (!conta.ativa) throw new RegraDeNegocio("Conta inativa", { campo: "conta", regra: "inativo" });

    // O esperado é gravado agora: lançamentos posteriores não mudam esta contagem.
    // A diferença compara só a espécie: o Pix não vira lançamento e fica à parte.
    const esperado = await esperadoNa(tx, v.modo, v.contaId, data);
    const diferenca = totalContado.sub(esperado);
    const divergente = !diferenca.isZero();
    if (divergente && !v.observacao) {
      throw new Validacao(MSG_OBSERVACAO_DIVERGENCIA, { campo: "observacao", regra: "obrigatorio_divergencia" });
    }

    const c = await tx.contagemCaixa.create({
      data: {
        modo: v.modo,
        contaId: v.contaId,
        data,
        totalContado,
        totalPix,
        esperado,
        diferenca,
        observacao: v.observacao ?? null,
        criadoPorId: quem.id,
        itens: { create: itens.map((i) => ({ denominacaoCentavos: i.denominacaoCentavos, quantidade: i.quantidade })) },
        pix: { create: pix.map((valor, ordem) => ({ ordem, valor })) },
      },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Contagem",
      entidadeId: c.id,
      acao: "REGISTROU_CONTAGEM",
      valorNovo: `Espécie ${formatarBRL(totalContado)} · Pix ${formatarBRL(totalPix)} · Esperado ${formatarBRL(esperado)} · Diferença ${formatarBRL(diferenca)}`,
    });
    await rastrearServidor(tx, quem, "contagem_registrada", { modo: v.modo, divergente });
    return c;
  });
}

// --------------------------------------------------------------- Leitura

const incluirNomes = {
  conta: { select: { nome: true } },
  criadoPor: { select: { nome: true } },
} satisfies Prisma.ContagemCaixaInclude;

type ContagemComNomes = Prisma.ContagemCaixaGetPayload<{ include: typeof incluirNomes }>;

const paraListada = (c: ContagemComNomes): ContagemListada => ({
  id: c.id,
  modo: c.modo,
  contaId: c.contaId,
  conta: c.conta.nome,
  data: c.modo === ModoContagem.CULTO ? formatarDataBR(c.data) : null,
  totalContado: c.totalContado,
  totalPix: c.totalPix,
  esperado: c.esperado,
  diferenca: c.diferenca,
  observacao: c.observacao,
  criadoPor: c.criadoPor.nome,
  criadoEm: c.criadoEm,
});

export async function listarContagens(
  ator: UsuarioAtual | null,
  filtro: FiltroContagens,
): Promise<{ itens: ContagemListada[]; total: number }> {
  exigir(ator, "financeiro.ver");
  const f = validar(esquemaFiltro, filtro ?? {});
  const where: Prisma.ContagemCaixaWhereInput = {
    ...(f.contaId ? { contaId: f.contaId } : {}),
    ...(f.de || f.ate ? { data: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } } : {}),
  };
  const [itens, total] = await Promise.all([
    prisma.contagemCaixa.findMany({
      where,
      include: incluirNomes,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      skip: (f.pagina - 1) * ITENS_POR_PAGINA_CONTAGENS,
      take: ITENS_POR_PAGINA_CONTAGENS,
    }),
    prisma.contagemCaixa.count({ where }),
  ]);
  return { itens: itens.map(paraListada), total };
}

export async function obterContagem(ator: UsuarioAtual | null, id: string): Promise<ContagemDetalhada> {
  exigir(ator, "financeiro.ver");
  const c = await prisma.contagemCaixa.findUnique({
    where: { id },
    include: { ...incluirNomes, itens: { orderBy: { denominacaoCentavos: "desc" } }, pix: { orderBy: { ordem: "asc" } } },
  });
  if (!c) throw new NaoEncontrado(MSG_CONTAGEM_NAO_ENCONTRADA);
  return {
    ...paraListada(c),
    pix: c.pix.map((p) => p.valor),
    itens: c.itens.map((i) => {
      const den = POR_CENTAVOS.get(i.denominacaoCentavos);
      return {
        denominacaoCentavos: i.denominacaoCentavos,
        quantidade: i.quantidade,
        rotulo: den?.rotulo ?? formatarBRL(new Prisma.Decimal(i.denominacaoCentavos).div(100)),
        tipo: den?.tipo ?? (i.denominacaoCentavos >= 200 ? "cedula" : "moeda"),
        subtotal: new Prisma.Decimal(i.denominacaoCentavos).mul(i.quantidade).div(100),
      };
    }),
  };
}
