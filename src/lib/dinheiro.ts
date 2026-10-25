import { Prisma } from "@prisma/client";
import { Validacao } from "@/lib/erros";

// Aceita: "R$" opcional, espaços opcionais, milhares com "." em grupos de 3,
// e vírgula decimal opcional com 1 ou 2 casas. Ex.: "1.234,56", "50", "0,5", "R$ 10,00".
// Com milhares, o primeiro grupo não começa com 0 ("0.500" seria lido como 500).
const PADRAO_VALOR_BR = /^\s*(?:R\$\s*)?((?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*$/;

/** Maior valor que cabe em Decimal(12,2): 9.999.999.999,99. */
export const VALOR_MAXIMO = new Prisma.Decimal("9999999999.99");

/**
 * Converte texto digitado em formato brasileiro para Decimal.
 * Rejeita negativos, valores acima de `VALOR_MAXIMO` e qualquer formato fora do padrão;
 * zero só com `permitirZero`.
 */
export function parseValorBR(texto: string, opcoes?: { permitirZero?: boolean }): Prisma.Decimal {
  const casado = PADRAO_VALOR_BR.exec(texto);
  if (!casado) throw new Validacao("Valor inválido");

  const normalizado = casado[1].replace(/\./g, "").replace(",", ".");
  const valor = new Prisma.Decimal(normalizado);
  if (opcoes?.permitirZero ? valor.lt(0) : valor.lte(0)) throw new Validacao("Valor inválido");
  if (valor.gt(VALOR_MAXIMO)) {
    throw new Validacao("Valor acima do limite permitido", { regra: "acima_limite" });
  }
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
