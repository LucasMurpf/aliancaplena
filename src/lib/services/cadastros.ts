// Cadastros de apoio: contas, categorias e membros.
import { Prisma, TipoConta, TipoMovimento } from "@prisma/client";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { formatarBRL, parseValorBR } from "@/lib/dinheiro";
import { formatarDataBR, parseDataBR } from "@/lib/datas";
import { NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog, type Entidade } from "@/lib/log";
import { rastrearServidor } from "./metricas";

const MSG_CONTA_NAO_ENCONTRADA = "Conta não encontrada";
const MSG_CATEGORIA_NAO_ENCONTRADA = "Categoria não encontrada";
const MSG_MEMBRO_NAO_ENCONTRADO = "Membro não encontrado";
const MSG_CATEGORIA_DUPLICADA = "Categoria já existe";

const LIMITE_BUSCA_MEMBROS = 20;

const esquemaNome = z.string({ error: "Informe o nome" }).trim().min(1, "Informe o nome");
const esquemaTipoConta = z.enum(Object.values(TipoConta) as [TipoConta, ...TipoConta[]], {
  error: "Tipo de conta inválido",
});
const esquemaTipoMovimento = z.enum(Object.values(TipoMovimento) as [TipoMovimento, ...TipoMovimento[]], {
  error: "Tipo de categoria inválido",
});
const esquemaSaldo = z.string({ error: "Valor inválido" }).transform((t) => parseValorBR(t, { permitirZero: true }));
const esquemaBool = z.boolean({ error: "Valor inválido" });
const esquemaTelefone = z
  .string({ error: "Telefone inválido" })
  .trim()
  .nullable()
  .transform((t) => (t ? t : null));
const esquemaData = z
  .string({ error: "Data inválida" })
  .trim()
  .nullable()
  .transform((t) => (t ? parseDataBR(t) : null));

const esquemaCriarConta = z.object({ nome: esquemaNome, tipo: esquemaTipoConta, saldoInicial: esquemaSaldo });
const esquemaAtualizarConta = esquemaCriarConta.partial();
const esquemaCriarCategoria = z.object({ nome: esquemaNome, tipo: esquemaTipoMovimento, nominal: esquemaBool });
const esquemaAtualizarCategoria = z.object({ nome: esquemaNome.optional(), nominal: esquemaBool.optional() });
const esquemaCriarMembro = z.object({
  nome: esquemaNome,
  telefone: esquemaTelefone.optional(),
  dataNascimento: esquemaData.optional(),
});
const esquemaAtualizarMembro = esquemaCriarMembro;

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new Validacao(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

const simNao = (b: boolean) => (b ? "Sim" : "Não");

/** Minúsculas e sem acentos, para busca. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

type Mudanca = { campo: string; de: string | null; para: string | null };

async function logarMudancas(tx: Prisma.TransactionClient, quem: UsuarioAtual, entidade: Entidade, id: string, ms: Mudanca[]) {
  for (const m of ms) {
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade,
      entidadeId: id,
      acao: "ALTEROU",
      campo: m.campo,
      valorAnterior: m.de ?? undefined,
      valorNovo: m.para ?? undefined,
    });
  }
}

// ---------------------------------------------------------------- Contas

const textoConta = (c: Pick<Conta, "nome" | "tipo" | "saldoInicial">) => ({
  nome: c.nome,
  tipo: c.tipo as string,
  saldoInicial: formatarBRL(c.saldoInicial),
});

export async function listarContas(ator: UsuarioAtual | null, opcoes: { incluirInativas?: boolean } = {}): Promise<Conta[]> {
  exigir(ator, "financeiro.ver");
  return prisma.conta.findMany({
    where: opcoes.incluirInativas ? {} : { ativa: true },
    orderBy: { nome: "asc" },
  });
}

export async function criarConta(
  ator: UsuarioAtual | null,
  d: { nome: string; tipo: TipoConta; saldoInicial: string },
): Promise<Conta> {
  const quem = exigir(ator, "cadastros.gerenciar");
  const v = validar(esquemaCriarConta, d);
  return prisma.$transaction(async (tx) => {
    const c = await tx.conta.create({ data: v });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Conta",
      entidadeId: c.id,
      acao: "CRIOU",
      valorNovo: c.nome,
    });
    return c;
  });
}

export async function atualizarConta(
  ator: UsuarioAtual | null,
  id: string,
  d: { nome?: string; tipo?: TipoConta; saldoInicial?: string },
): Promise<void> {
  const quem = exigir(ator, "cadastros.gerenciar");
  const v = validar(esquemaAtualizarConta, d);
  await prisma.$transaction(async (tx) => {
    const atual = await tx.conta.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado(MSG_CONTA_NAO_ENCONTRADA);
    const novo = {
      nome: v.nome ?? atual.nome,
      tipo: v.tipo ?? atual.tipo,
      saldoInicial: v.saldoInicial ?? atual.saldoInicial,
    };
    const antes = textoConta(atual);
    const depois = textoConta(novo);
    const mudancas = (Object.keys(depois) as (keyof typeof depois)[])
      .filter((k) => antes[k] !== depois[k])
      .map((k) => ({ campo: k, de: antes[k], para: depois[k] }));
    if (mudancas.length === 0) return;
    await tx.conta.update({ where: { id }, data: novo });
    await logarMudancas(tx, quem, "Conta", id, mudancas);
  });
}

export async function definirContaAtiva(ator: UsuarioAtual | null, id: string, ativa: boolean): Promise<void> {
  const quem = exigir(ator, "cadastros.gerenciar");
  await prisma.$transaction(async (tx) => {
    const atual = await tx.conta.findUnique({ where: { id }, select: { ativa: true } });
    if (!atual) throw new NaoEncontrado(MSG_CONTA_NAO_ENCONTRADA);
    if (atual.ativa === ativa) return;
    await tx.conta.update({ where: { id }, data: { ativa } });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Conta",
      entidadeId: id,
      acao: ativa ? "REATIVOU" : "INATIVOU",
    });
  });
}

// ------------------------------------------------------------ Categorias

function traduzirCategoriaDuplicada(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new Validacao(MSG_CATEGORIA_DUPLICADA);
  }
  throw e;
}

export async function listarCategorias(
  ator: UsuarioAtual | null,
  opcoes: { tipo?: TipoMovimento; incluirInativas?: boolean } = {},
): Promise<Categoria[]> {
  exigir(ator, "financeiro.ver");
  return prisma.categoria.findMany({
    where: {
      ...(opcoes.tipo ? { tipo: opcoes.tipo } : {}),
      ...(opcoes.incluirInativas ? {} : { ativa: true }),
    },
    orderBy: { nome: "asc" },
  });
}

export async function criarCategoria(
  ator: UsuarioAtual | null,
  d: { nome: string; tipo: TipoMovimento; nominal: boolean },
): Promise<Categoria> {
  const quem = exigir(ator, "cadastros.gerenciar");
  const v = validar(esquemaCriarCategoria, d);
  try {
    return await prisma.$transaction(async (tx) => {
      const existente = await tx.categoria.findUnique({
        where: { nome_tipo: { nome: v.nome, tipo: v.tipo } },
        select: { id: true },
      });
      if (existente) throw new Validacao(MSG_CATEGORIA_DUPLICADA);
      const c = await tx.categoria.create({ data: v });
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Categoria",
        entidadeId: c.id,
        acao: "CRIOU",
        valorNovo: c.nome,
      });
      return c;
    });
  } catch (e) {
    return traduzirCategoriaDuplicada(e);
  }
}

export async function atualizarCategoria(
  ator: UsuarioAtual | null,
  id: string,
  d: { nome?: string; nominal?: boolean; tipo?: TipoMovimento },
): Promise<void> {
  const quem = exigir(ator, "cadastros.gerenciar");
  const v = validar(esquemaAtualizarCategoria, d);
  try {
    await prisma.$transaction(async (tx) => {
      const atual = await tx.categoria.findUnique({ where: { id } });
      if (!atual) throw new NaoEncontrado(MSG_CATEGORIA_NAO_ENCONTRADA);
      if (d.tipo !== undefined && d.tipo !== atual.tipo) {
        throw new RegraDeNegocio("O tipo da categoria não pode ser alterado");
      }
      const nome = v.nome ?? atual.nome;
      const nominal = v.nominal ?? atual.nominal;
      const mudancas: Mudanca[] = [];
      if (nome !== atual.nome) mudancas.push({ campo: "nome", de: atual.nome, para: nome });
      if (nominal !== atual.nominal) {
        mudancas.push({ campo: "nominal", de: simNao(atual.nominal), para: simNao(nominal) });
      }
      if (mudancas.length === 0) return;
      if (nome !== atual.nome) {
        const outra = await tx.categoria.findUnique({
          where: { nome_tipo: { nome, tipo: atual.tipo } },
          select: { id: true },
        });
        if (outra) throw new Validacao(MSG_CATEGORIA_DUPLICADA);
      }
      await tx.categoria.update({ where: { id }, data: { nome, nominal } });
      await logarMudancas(tx, quem, "Categoria", id, mudancas);
    });
  } catch (e) {
    traduzirCategoriaDuplicada(e);
  }
}

export async function definirCategoriaAtiva(ator: UsuarioAtual | null, id: string, ativa: boolean): Promise<void> {
  const quem = exigir(ator, "cadastros.gerenciar");
  await prisma.$transaction(async (tx) => {
    const atual = await tx.categoria.findUnique({ where: { id }, select: { ativa: true } });
    if (!atual) throw new NaoEncontrado(MSG_CATEGORIA_NAO_ENCONTRADA);
    if (atual.ativa === ativa) return;
    await tx.categoria.update({ where: { id }, data: { ativa } });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Categoria",
      entidadeId: id,
      acao: ativa ? "REATIVOU" : "INATIVOU",
    });
  });
}

// --------------------------------------------------------------- Membros

const textoMembro = (m: Pick<Membro, "nome" | "telefone" | "dataNascimento">) => ({
  nome: m.nome as string | null,
  telefone: m.telefone,
  dataNascimento: m.dataNascimento ? formatarDataBR(m.dataNascimento) : null,
});

export async function buscarMembros(
  ator: UsuarioAtual | null,
  termo: string,
  opcoes: { incluirInativos?: boolean } = {},
): Promise<Membro[]> {
  exigir(ator, "membros.ver_nomes");
  return prisma.membro.findMany({
    where: {
      nomeBusca: { contains: normalizarBusca(termo ?? "") },
      ...(opcoes.incluirInativos ? {} : { ativo: true }),
    },
    orderBy: { nome: "asc" },
    take: LIMITE_BUSCA_MEMBROS,
  });
}

export async function criarMembro(
  ator: UsuarioAtual | null,
  d: { nome: string; telefone?: string | null; dataNascimento?: string | null },
  opcoes?: { origem?: "rapido" | "cadastro" },
): Promise<Membro> {
  const quem = exigir(ator, "membros.gerenciar");
  const v = validar(esquemaCriarMembro, d);
  return prisma.$transaction(async (tx) => {
    const m = await tx.membro.create({
      data: {
        nome: v.nome,
        nomeBusca: normalizarBusca(v.nome),
        telefone: v.telefone ?? null,
        dataNascimento: v.dataNascimento ?? null,
      },
    });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Membro",
      entidadeId: m.id,
      acao: "CRIOU",
      valorNovo: m.nome,
    });
    if (opcoes?.origem === "rapido") await rastrearServidor(tx, quem, "membro_cadastrado_rapido", { origem: "rapido" });
    return m;
  });
}

// Campos omitidos permanecem; telefone/dataNascimento aceitam null (ou "") para limpar.
export async function atualizarMembro(
  ator: UsuarioAtual | null,
  id: string,
  d: { nome?: string; telefone?: string | null; dataNascimento?: string | null },
): Promise<void> {
  const quem = exigir(ator, "membros.gerenciar");
  const v = validar(esquemaAtualizarMembro.partial(), d);
  await prisma.$transaction(async (tx) => {
    const atual = await tx.membro.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado(MSG_MEMBRO_NAO_ENCONTRADO);
    const novo = {
      nome: v.nome ?? atual.nome,
      telefone: v.telefone === undefined ? atual.telefone : v.telefone,
      dataNascimento: v.dataNascimento === undefined ? atual.dataNascimento : v.dataNascimento,
    };
    const antes = textoMembro(atual);
    const depois = textoMembro(novo);
    const mudancas = (Object.keys(depois) as (keyof typeof depois)[])
      .filter((k) => antes[k] !== depois[k])
      .map((k) => ({ campo: k, de: antes[k], para: depois[k] }));
    if (mudancas.length === 0) return;
    await tx.membro.update({
      where: { id },
      data: { ...novo, nomeBusca: normalizarBusca(novo.nome) },
    });
    await logarMudancas(tx, quem, "Membro", id, mudancas);
  });
}

export async function definirMembroAtivo(ator: UsuarioAtual | null, id: string, ativo: boolean): Promise<void> {
  const quem = exigir(ator, "membros.gerenciar");
  await prisma.$transaction(async (tx) => {
    const atual = await tx.membro.findUnique({ where: { id }, select: { ativo: true } });
    if (!atual) throw new NaoEncontrado(MSG_MEMBRO_NAO_ENCONTRADO);
    if (atual.ativo === ativo) return;
    await tx.membro.update({ where: { id }, data: { ativo } });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Membro",
      entidadeId: id,
      acao: ativo ? "REATIVOU" : "INATIVOU",
    });
  });
}
