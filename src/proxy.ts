// Proxy (antigo middleware, Next 16): protege as rotas e renova a sessão (expiração deslizante).
// Públicas: /login, /instalacao, a prestação de contas pública (/p/<token> e seu PDF) e arquivos
// estáticos (excluídos pelo matcher). As públicas passam sem ler nem renovar sessão.
// Roda só com `jose` (sessao-token), sem Prisma: a checagem de usuário ativo e da versão da sessão fica no layout.
// Ao renovar, reemite o token com a mesma versão `v` que leu (quem decide se ela ainda vale é o banco).
import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, criarTokenSessao, lerTokenSessao, opcoesCookieSessao } from "@/lib/sessao-token";

const ROTAS_PUBLICAS = ["/login", "/instalacao", "/p", "/api/pdf/prestacao"];

function ehPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

function paraLogin(request: NextRequest): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("expirou", "1");
  const resposta = NextResponse.redirect(url);
  resposta.cookies.delete(NOME_COOKIE_SESSAO);
  return resposta;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (ehPublica(pathname)) return NextResponse.next();

  // /api/uso responde sempre 204 e trata a falta de sessão por conta própria: não redireciona.
  const ehApi = pathname.startsWith("/api/");
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;

  if (!token) return ehApi ? NextResponse.next() : paraLogin(request);

  let sessao: { usuarioId: string; versao: number } | null;
  try {
    sessao = await lerTokenSessao(token);
  } catch {
    // SESSION_SECRET ausente/curto: nunca 500.
    return ehApi ? NextResponse.next() : paraLogin(request);
  }
  if (!sessao) return ehApi ? NextResponse.next() : paraLogin(request);

  const resposta = NextResponse.next();
  // Não renova em prefetch (não é ação do usuário) nem em Server Actions (elas gravam/apagam
  // o cookie por conta própria, ex.: `sair`; um Set-Cookie daqui poderia desfazer o logout).
  const ehPrefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
  const ehAction = request.headers.has("next-action");
  if (!ehPrefetch && !ehAction) {
    try {
      resposta.cookies.set(NOME_COOKIE_SESSAO, await criarTokenSessao(sessao.usuarioId, sessao.versao), opcoesCookieSessao());
    } catch {
      return ehApi ? NextResponse.next() : paraLogin(request);
    }
  }
  return resposta;
}

export const config = {
  // Tudo, menos internos do Next e arquivos com extensão (estáticos de public/).
  matcher: ["/((?!_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
