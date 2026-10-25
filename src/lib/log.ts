import type { Prisma } from "@prisma/client";

export type Acao =
  | "CRIOU"
  | "ALTEROU"
  | "DEU_BAIXA"
  | "CANCELOU"
  | "INATIVOU"
  | "REATIVOU"
  | "ANEXOU"
  | "LOGIN"
  | "LOGIN_FALHOU"
  | "INSTALOU";

export type Entidade =
  | "Lancamento"
  | "Transferencia"
  | "Membro"
  | "Conta"
  | "Categoria"
  | "Usuario"
  | "Configuracao"
  | "Login";

export type EntradaLog = {
  usuarioId?: string;
  entidade: Entidade;
  entidadeId: string;
  acao: Acao;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
};

// Histórico append-only: este módulo não expõe atualização nem exclusão.
// Recebe o cliente da transação para que o log reverta junto com a operação.
// Os valores devem vir já legíveis (nome da categoria, formatarBRL, formatarDataBR).
export async function registrarLog(tx: Prisma.TransactionClient, e: EntradaLog): Promise<void> {
  await tx.log.create({
    data: {
      usuarioId: e.usuarioId,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      acao: e.acao,
      campo: e.campo,
      valorAnterior: e.valorAnterior,
      valorNovo: e.valorNovo,
    },
  });
}

export function diffCampos(
  antes: Record<string, string | null>,
  depois: Record<string, string | null>,
): { campo: string; de: string | null; para: string | null }[] {
  const mudancas: { campo: string; de: string | null; para: string | null }[] = [];
  for (const campo of Object.keys(depois)) {
    const de = antes[campo] ?? null;
    const para = depois[campo] ?? null;
    if (String(de) !== String(para)) mudancas.push({ campo, de, para });
  }
  return mudancas;
}
