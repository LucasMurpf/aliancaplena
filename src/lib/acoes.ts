// Peças comuns das Server Actions: resultado padrão e tradução de erros para mensagens.
import { ErroApp } from "@/lib/erros";

/** `valores`: campos (nunca senhas) devolvidos para o formulário repreencher, pois o React limpa o form após a action. */
export type EstadoForm = { erro?: string; ok?: boolean; valores?: Record<string, string> };

export const MENSAGEM_ERRO_GENERICO = "Algo deu errado, tente novamente";

/** `ErroApp` mostra a própria mensagem; qualquer outro erro vira a mensagem genérica (e vai para o log do servidor). */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApp) return e.message;
  console.error(e);
  return MENSAGEM_ERRO_GENERICO;
}
