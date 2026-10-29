import { Validacao } from "@/lib/erros";

const FUSO_NEGOCIO = "America/Sao_Paulo";

/** Monta Date em meia-noite UTC e confere se os componentes não "estouraram" (ex.: 31/02). */
function dataUTCValida(ano: number, mes: number, dia: number): Date {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Validacao("Data inválida");
  }
  return d;
}

/** Aceita "dd/mm/aaaa" ou "aaaa-mm-dd". Retorna meia-noite UTC daquele dia. */
export function parseDataBR(texto: string): Date {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (br) return dataUTCValida(Number(br[3]), Number(br[2]), Number(br[1]));

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) return dataUTCValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  throw new Validacao("Data inválida");
}

/** Formata como "dd/mm/aaaa" a partir dos componentes UTC. */
export function formatarDataBR(d: Date): string {
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

/** "dd/mm/aaaa" do dia civil de um instante no fuso de São Paulo (diferente de formatarDataBR, que lê UTC). */
export function formatarDataSP(instante: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instante);
}

/** Início (inclusive) e fim (exclusivo) de um mês, em meia-noite UTC. */
export function limitesDoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Validacao("Mês inválido");
  }
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 1)),
  };
}

/** Data de hoje no fuso de São Paulo, como meia-noite UTC do mesmo dia civil. */
export function hojeSP(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "27 de outubro de 2026", a partir dos componentes UTC. */
export function dataPorExtenso(d: Date): string {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
