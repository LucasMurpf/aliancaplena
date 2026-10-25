// Rótulos em pt-BR dos enums, para telas (sem imports de servidor: usado em componentes cliente).
import type { Papel, TipoConta, TipoMovimento } from "@prisma/client";

export const PAPEIS_ORDEM = ["ADMIN", "PASTOR", "TESOUREIRO", "EVENTOS", "PATRIMONIO"] as const satisfies readonly Papel[];

export const ROTULO_PAPEL = {
  ADMIN: "Administrador",
  PASTOR: "Pastor",
  TESOUREIRO: "Tesoureiro",
  EVENTOS: "Responsável por Eventos",
  PATRIMONIO: "Responsável pelo Patrimônio",
} as const satisfies Record<Papel, string>;

export const ROTULO_TIPO_CONTA = { CAIXA: "Caixa", BANCO: "Banco" } as const satisfies Record<TipoConta, string>;

export const ROTULO_TIPO_MOVIMENTO = { ENTRADA: "Entrada", SAIDA: "Saída" } as const satisfies Record<TipoMovimento, string>;
