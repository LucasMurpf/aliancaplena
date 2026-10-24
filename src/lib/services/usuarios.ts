// Gestão de usuários e papéis (somente administradores).
import { Papel, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, hashSenha, type UsuarioAtual } from "@/lib/auth";
import { NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { esquemaEmail, esquemaSenha } from "@/lib/validacao";

// Chave do advisory lock que serializa mudanças de papel/situação (evita dois admins se rebaixando ao mesmo tempo).
const LOCK_USUARIOS = 4243;

const MSG_SEM_ADMIN = "O sistema precisa de ao menos um administrador ativo";
const MSG_EMAIL_DUPLICADO = "E-mail já cadastrado";
const MSG_NAO_ENCONTRADO = "Usuário não encontrado";

const esquemaNome = z.string({ error: "Informe o nome" }).trim().min(1, "Informe o nome");

const esquemaPapeis = z
  .array(z.enum(Object.values(Papel) as [Papel, ...Papel[]], { error: "Papel inválido" }), {
    error: "Informe ao menos um papel",
  })
  .min(1, "Informe ao menos um papel")
  .transform((l) => [...new Set(l)].sort());

const esquemaCriar = z.object({
  nome: esquemaNome,
  email: esquemaEmail,
  senha: esquemaSenha,
  papeis: esquemaPapeis,
});

const esquemaAtualizar = z.object({
  nome: esquemaNome.optional(),
  email: esquemaEmail.optional(),
  papeis: esquemaPapeis.optional(),
});

export type UsuarioListado = UsuarioAtual & { ativo: boolean };

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new Validacao(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

const textoPapeis = (l: Papel[]) => [...l].sort().join(", ");

async function travar(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_USUARIOS})`;
}

// Chamada depois de aplicar a mudança, dentro da transação: lançar aqui desfaz tudo.
async function garantirAdminAtivo(tx: Prisma.TransactionClient) {
  const n = await tx.usuario.count({ where: { ativo: true, papeis: { some: { papel: "ADMIN" } } } });
  if (n === 0) throw new RegraDeNegocio(MSG_SEM_ADMIN);
}

async function garantirEmailLivre(tx: Prisma.TransactionClient, email: string, exceto?: string) {
  const existente = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente && existente.id !== exceto) throw new Validacao(MSG_EMAIL_DUPLICADO);
}

// Corrida entre duas criações com o mesmo e-mail: a constraint única decide.
function traduzirDuplicado(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new Validacao(MSG_EMAIL_DUPLICADO);
  }
  throw e;
}

export async function listarUsuarios(ator: UsuarioAtual | null): Promise<UsuarioListado[]> {
  exigir(ator, "admin");
  const us = await prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, ativo: true, papeis: { select: { papel: true } } },
  });
  return us.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    ativo: u.ativo,
    papeis: u.papeis.map((p) => p.papel).sort(),
  }));
}

export async function criarUsuario(
  ator: UsuarioAtual | null,
  d: { nome: string; email: string; senha: string; papeis: Papel[] },
): Promise<UsuarioAtual> {
  const quem = exigir(ator, "admin");
  const v = validar(esquemaCriar, d);
  const senhaHash = await hashSenha(v.senha);

  try {
    return await prisma.$transaction(async (tx) => {
      await garantirEmailLivre(tx, v.email);
      const u = await tx.usuario.create({
        data: {
          nome: v.nome,
          email: v.email,
          senhaHash,
          papeis: { create: v.papeis.map((papel) => ({ papel })) },
        },
      });
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Usuario",
        entidadeId: u.id,
        acao: "CRIOU",
        valorNovo: textoPapeis(v.papeis),
      });
      return { id: u.id, nome: u.nome, email: u.email, papeis: v.papeis };
    });
  } catch (e) {
    return traduzirDuplicado(e);
  }
}

export async function atualizarUsuario(
  ator: UsuarioAtual | null,
  id: string,
  d: { nome?: string; email?: string; papeis?: Papel[] },
): Promise<void> {
  const quem = exigir(ator, "admin");
  const v = validar(esquemaAtualizar, d);

  try {
    await prisma.$transaction(async (tx) => {
      await travar(tx);
      const atual = await tx.usuario.findUnique({
        where: { id },
        select: { nome: true, email: true, papeis: { select: { papel: true } } },
      });
      if (!atual) throw new NaoEncontrado(MSG_NAO_ENCONTRADO);

      const antes = {
        nome: atual.nome,
        email: atual.email,
        papeis: textoPapeis(atual.papeis.map((p) => p.papel)),
      };
      const depois = {
        nome: v.nome ?? antes.nome,
        email: v.email ?? antes.email,
        papeis: v.papeis ? textoPapeis(v.papeis) : antes.papeis,
      };
      const mudou = {
        nome: depois.nome !== antes.nome,
        email: depois.email !== antes.email,
        papeis: depois.papeis !== antes.papeis,
      };

      if (mudou.email) await garantirEmailLivre(tx, depois.email, id);
      if (mudou.nome || mudou.email) {
        await tx.usuario.update({ where: { id }, data: { nome: depois.nome, email: depois.email } });
      }
      if (mudou.papeis && v.papeis) {
        await tx.usuarioPapel.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioPapel.createMany({ data: v.papeis.map((papel) => ({ usuarioId: id, papel })) });
        await garantirAdminAtivo(tx);
      }

      for (const campo of ["nome", "email", "papeis"] as const) {
        if (!mudou[campo]) continue;
        await registrarLog(tx, {
          usuarioId: quem.id,
          entidade: "Usuario",
          entidadeId: id,
          acao: "ALTEROU",
          campo,
          valorAnterior: antes[campo],
          valorNovo: depois[campo],
        });
      }
    });
  } catch (e) {
    traduzirDuplicado(e);
  }
}

export async function definirAtivo(ator: UsuarioAtual | null, id: string, ativo: boolean): Promise<void> {
  const quem = exigir(ator, "admin");

  await prisma.$transaction(async (tx) => {
    await travar(tx);
    const atual = await tx.usuario.findUnique({ where: { id }, select: { ativo: true } });
    if (!atual) throw new NaoEncontrado(MSG_NAO_ENCONTRADO);
    if (atual.ativo === ativo) return;

    await tx.usuario.update({ where: { id }, data: { ativo } });
    if (!ativo) await garantirAdminAtivo(tx);
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Usuario",
      entidadeId: id,
      acao: ativo ? "REATIVOU" : "INATIVOU",
    });
  });
}

export async function redefinirSenha(ator: UsuarioAtual | null, id: string, novaSenha: string): Promise<void> {
  const quem = exigir(ator, "admin");
  const senha = validar(esquemaSenha, novaSenha);
  const senhaHash = await hashSenha(senha);

  await prisma.$transaction(async (tx) => {
    const atual = await tx.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!atual) throw new NaoEncontrado(MSG_NAO_ENCONTRADO);
    await tx.usuario.update({ where: { id }, data: { senhaHash } });
    await registrarLog(tx, {
      usuarioId: quem.id,
      entidade: "Usuario",
      entidadeId: id,
      acao: "ALTEROU",
      campo: "senha",
    });
  });
}
