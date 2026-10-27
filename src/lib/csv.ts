import { Prisma } from "@prisma/client";
import { formatarDataBR } from "@/lib/datas";

export type ColunaCsv<T> = {
  titulo: string;
  valor: (linha: T) => string | Prisma.Decimal | Date | null | undefined;
};

const BOM = "﻿";
/** Células que o Excel/Calc interpretariam como fórmula. */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/** Texto: neutraliza fórmulas com apóstrofo e escapa aspas, ';' e quebras de linha. */
function celulaTexto(texto: string): string {
  let celula = INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  if (/[;"\r\n]/.test(celula)) celula = `"${celula.replace(/"/g, '""')}"`;
  return celula;
}

/** Valor de célula: Decimal sai numérico (sem apóstrofo), Date como dd/mm/aaaa, nulo vira vazio. */
function celula(valor: string | Prisma.Decimal | Date | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Prisma.Decimal) return valor.toFixed(2).replace(".", ",");
  if (valor instanceof Date) return formatarDataBR(valor);
  return celulaTexto(valor);
}

/**
 * Gera CSV para o Excel brasileiro: BOM UTF-8, separador ';', fim de linha CRLF e cabeçalho na primeira linha.
 */
export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((c) => celulaTexto(c.titulo)).join(";");
  const corpo = linhas.map((linha) => colunas.map((c) => celula(c.valor(linha))).join(";"));
  return BOM + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}
