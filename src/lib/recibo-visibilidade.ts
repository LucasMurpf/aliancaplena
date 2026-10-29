// O que a seção "Recibo" do detalhe do lançamento mostra (lógica pura, sem Prisma).

export type SecaoRecibo = "oculta" | "emitir" | "baixar" | "baixar-cancelado";

/**
 * - `temPermissoes`: o ator tem `financeiro.lancar` e `membros.ver_nomes`;
 * - `elegivel`: pode emitir/reemitir hoje (entrada, realizada, nominal, com membro e permissões);
 * - `numero`: número do recibo já emitido, se houver.
 * Lançamento cancelado com recibo existente só permite baixar (nunca emite um novo).
 */
export function secaoRecibo(o: { temPermissoes: boolean; elegivel: boolean; numero: string | null; cancelado: boolean }): SecaoRecibo {
  if (!o.temPermissoes) return "oculta";
  if (o.cancelado) return o.numero ? "baixar-cancelado" : "oculta";
  if (!o.elegivel) return "oculta";
  return o.numero ? "baixar" : "emitir";
}
