import { Prisma } from "@prisma/client";
import { Validacao } from "@/lib/erros";

// Aceita: "R$" opcional, espaços opcionais, milhares com "." em grupos de 3,
// e vírgula decimal opcional com 1 ou 2 casas. Ex.: "1.234,56", "50", "0,5", "R$ 10,00".
const PADRAO_VALOR_BR = /^\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*$/;

/**
 * Converte texto digitado em formato brasileiro para Decimal.
 * Rejeita zero, negativos e qualquer formato fora do padrão.
 */
export function parseValorBR(texto: string): Prisma.Decimal {
  const casado = PADRAO_VALOR_BR.exec(texto);
  if (!casado) throw new Validacao("Valor inválido");

  const normalizado = casado[1].replace(/\./g, "").replace(",", ".");
  const valor = new Prisma.Decimal(normalizado);
  if (valor.lte(0)) throw new Validacao("Valor inválido");
  return valor;
}

/** Formata como moeda brasileira: "R$ 1.234,50". */
export function formatarBRL(valor: Prisma.Decimal | string): string {
  const decimal = typeof valor === "string" ? new Prisma.Decimal(valor) : valor;
  const [inteiro, centavos] = decimal.toFixed(2).split(".");
  const negativo = inteiro.startsWith("-");
  const digitos = negativo ? inteiro.slice(1) : inteiro;
  const agrupado = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${agrupado},${centavos}`;
}
