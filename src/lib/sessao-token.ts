// Token de sessão (JWT HS256). Só depende de `jose`: pode ser importado pelo
// middleware (edge runtime) sem puxar bcryptjs nem Prisma.
import { SignJWT, jwtVerify } from "jose";

/** Sessão expira após 15 minutos sem atividade (renovada a cada requisição). */
export const TEMPO_SESSAO_SEGUNDOS = 15 * 60;

export const NOME_COOKIE_SESSAO = "sessao";

/** Opções do cookie de sessão (sem nome/valor). */
export function opcoesCookieSessao() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TEMPO_SESSAO_SEGUNDOS,
  };
}

const ALGORITMO = "HS256";
const TAMANHO_MINIMO_SEGREDO = 32;

function chaveSessao(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error(
      `SESSION_SECRET ausente ou curto: defina no .env um segredo com no mínimo ${TAMANHO_MINIMO_SEGREDO} caracteres.`,
    );
  }
  return new TextEncoder().encode(segredo);
}

/** `versao` é `Usuario.versaoSessao`: mudar a versão no banco invalida os tokens já emitidos. */
export async function criarTokenSessao(usuarioId: string, versao: number): Promise<string> {
  const chave = chaveSessao();
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({ v: versao })
    .setProtectedHeader({ alg: ALGORITMO })
    .setSubject(usuarioId)
    .setIssuedAt(agora)
    .setExpirationTime(agora + TEMPO_SESSAO_SEGUNDOS)
    .sign(chave);
}

/** Devolve o id e a versão (token antigo sem `v` → 0), ou `null` se o token for inválido, adulterado ou expirado. Nunca lança por token ruim. */
export async function lerTokenSessao(token: string): Promise<{ usuarioId: string; versao: number } | null> {
  const chave = chaveSessao();
  try {
    const { payload } = await jwtVerify(token, chave, {
      algorithms: [ALGORITMO],
      currentDate: new Date(),
    });
    if (typeof payload.sub !== "string" || payload.sub === "") return null;
    const v = payload.v;
    return { usuarioId: payload.sub, versao: typeof v === "number" && Number.isInteger(v) ? v : 0 };
  } catch {
    return null;
  }
}
