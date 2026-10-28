import type { Prisma } from "@prisma/client";
import { formatarBRL } from "@/lib/dinheiro";

/** Texto e cor da diferença de uma contagem já gravada (Decimal lido no servidor). */
export function descricaoDiferenca(d: Prisma.Decimal): { texto: string; classe: string } {
  if (d.isZero()) return { texto: "Confere", classe: "text-emerald-700" };
  return d.isNegative()
    ? { texto: `Faltam ${formatarBRL(d.abs())}`, classe: "text-red-700" }
    : { texto: `Sobram ${formatarBRL(d)}`, classe: "text-amber-700" };
}

export const ROTULO_MODO = { CULTO: "Culto", CAIXA: "Caixa" } as const;

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatarDataHora = (d: Date) => fmtHora.format(d);
