// Wrapper das Server Actions: obtém o ator da sessão (R16) e converte erros de domínio no resultado padrão.
// Os serviços decidem as permissões; aqui só há sessão e tradução de erro (falhaDeErro).
import { obterUsuarioAtual, type UsuarioAtual } from "@/lib/auth";
import { falhaDeErro, type ResultadoAcao } from "@/lib/acoes";

const MSG_SESSAO = "Sua sessão expirou. Entre novamente.";

export async function executar<T extends object>(fn: (ator: UsuarioAtual) => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    const ator = await obterUsuarioAtual();
    if (!ator) return { erro: MSG_SESSAO };
    return { ok: true, ...(await fn(ator)) };
  } catch (e) {
    return falhaDeErro(e);
  }
}
