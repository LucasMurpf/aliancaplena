// Peças comuns das Server Actions: resultado padrão e tradução de erros para mensagens.
import { ErroApp } from "@/lib/erros";

/** `valores`: campos (nunca senhas) devolvidos para o formulário repreencher, pois o React limpa o form após a action. */
export type EstadoForm = { erro?: string; ok?: boolean; valores?: Record<string, string> };

/**
 * Resultado das Server Actions chamadas direto do cliente (sem useActionState).
 * `campo`/`regra` (de `ErroApp`) permitem mostrar o erro junto ao campo e medir `erro_validacao`;
 * `inesperado` marca erro que não é de domínio (métrica `erro_inesperado`).
 */
export type ResultadoAcao<T extends object = object> =
  | ({ ok: true } & T)
  | { ok?: false; erro: string; campo?: string; regra?: string; inesperado?: boolean };

export const MENSAGEM_ERRO_GENERICO = "Algo deu errado, tente novamente";

/** `ErroApp` mostra a própria mensagem; qualquer outro erro vira a mensagem genérica (e vai para o log do servidor). */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApp) return e.message;
  console.error(e);
  return MENSAGEM_ERRO_GENERICO;
}

/** Versão de `mensagemDeErro` que também devolve onde o erro ocorreu. */
export function falhaDeErro(e: unknown): Extract<ResultadoAcao, { erro: string }> {
  if (e instanceof ErroApp) return { erro: e.message, campo: e.campo, regra: e.regra };
  return { erro: mensagemDeErro(e), inesperado: true };
}
