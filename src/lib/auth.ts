// Autenticação: senha, sessão e checagem de permissão.
// Regra para serviços: todo serviço recebe `ator: UsuarioAtual | null` como
// primeiro parâmetro (testável sem cookie); Server Actions passam
// `await obterUsuarioAtual()`.
import bcrypt from "bcryptjs";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { Papel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NaoAutorizado } from "@/lib/erros";
import { pode, type Permissao } from "@/lib/permissoes";
import { NOME_COOKIE_SESSAO, criarTokenSessao, lerTokenSessao, opcoesCookieSessao } from "@/lib/sessao-token";

export {
  NOME_COOKIE_SESSAO,
  TEMPO_SESSAO_SEGUNDOS,
  criarTokenSessao,
  lerTokenSessao,
  opcoesCookieSessao,
} from "@/lib/sessao-token";

const CUSTO_BCRYPT = 12;

export type UsuarioAtual = { id: string; nome: string; email: string; papeis: Papel[] };

export function hashSenha(s: string): Promise<string> {
  return bcrypt.hash(s, CUSTO_BCRYPT);
}

export function conferirSenha(s: string, hash: string): Promise<boolean> {
  return bcrypt.compare(s, hash);
}

/**
 * `null` se o usuário não existe ou está inativo. Com `versao` (a do token), também `null`
 * quando difere de `Usuario.versaoSessao` (senha redefinida, papéis mudados, usuário inativado).
 */
export async function carregarUsuario(usuarioId: string, versao?: number): Promise<UsuarioAtual | null> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, nome: true, email: true, ativo: true, versaoSessao: true, papeis: { select: { papel: true } } },
  });
  if (!u || !u.ativo) return null;
  if (versao !== undefined && versao !== u.versaoSessao) return null;
  return { id: u.id, nome: u.nome, email: u.email, papeis: u.papeis.map((p) => p.papel) };
}

/** Lança `NaoAutorizado` se não há usuário ou se ele não tem a permissão; senão devolve o próprio usuário. */
export function exigir(usuario: UsuarioAtual | null, p: Permissao): UsuarioAtual {
  if (!usuario || !pode(usuario.papeis, p)) throw new NaoAutorizado();
  return usuario;
}

/** Token novo com a versão de sessão atual do usuário (login, instalação, renovação). */
export async function emitirTokenSessao(usuarioId: string): Promise<string> {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { versaoSessao: true } });
  return criarTokenSessao(usuarioId, u.versaoSessao);
}

// --- Wrappers finos sobre next/headers (só funcionam dentro de uma requisição) ---

export async function obterUsuarioAtual(): Promise<UsuarioAtual | null> {
  const token = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
  if (!token) return null;
  // Validar expiração usa a hora atual: isso só pode rodar em requisição, nunca no prerender.
  await connection();
  const sessao = await lerTokenSessao(token);
  return sessao ? carregarUsuario(sessao.usuarioId, sessao.versao) : null;
}

/** Só em Server Functions ou Route Handlers. */
export async function gravarCookieSessao(token: string): Promise<void> {
  (await cookies()).set(NOME_COOKIE_SESSAO, token, opcoesCookieSessao());
}

/** Só em Server Functions ou Route Handlers. */
export async function apagarCookieSessao(): Promise<void> {
  (await cookies()).delete(NOME_COOKIE_SESSAO);
}
