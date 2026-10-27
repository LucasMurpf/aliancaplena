// Foto pública de um mês (prestação de contas). Puro: recebe dados já agregados e devolve só
// texto formatado. Nunca recebe nem devolve membro, conta, usuário ou anexo; entradas só em total.
import { Prisma } from "@prisma/client";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarDataBR } from "@/lib/datas";

export type SnapshotPrestacao = {
  versaoSchema: 1;
  igreja: { nome: string; logoUrl: string | null };
  ano: number;
  mes: number;
  /** "Outubro de 2026" ou "Outubro de 2026 (parcial, até 27/10/2026)". */
  rotulo: string;
  /** Mês corrente: valores até `dataCorte` (hoje), não do mês inteiro. */
  parcial: boolean;
  /** dd/mm/aaaa — último dia considerado (fim do mês ou hoje). */
  dataCorte: string;
  resumo: { entradas: string; saidas: string; resultado: string; saldoFimMes: string };
  entradas: { categoria: string; total: string }[];
  saidas: { categoria: string; total: string; itens?: { data: string; descricao: string; valor: string }[] }[];
};

export type DadosSnapshot = {
  igreja: { nome: string; logoUrl: string | null };
  ano: number;
  mes: number;
  dataCorte: Date;
  parcial: boolean;
  /** Saldo somado de todas as contas no fim de `dataCorte`. */
  saldoFimMes: Prisma.Decimal;
  entradas: { categoria: string; total: Prisma.Decimal }[];
  saidas: {
    categoria: string;
    total: Prisma.Decimal;
    detalharPublico: boolean;
    itens: { data: Date; descricao: string | null; valor: Prisma.Decimal }[];
  }[];
};

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const porTotalDesc = (a: { categoria: string; total: Prisma.Decimal }, b: { categoria: string; total: Prisma.Decimal }) =>
  b.total.comparedTo(a.total) || a.categoria.localeCompare(b.categoria, "pt-BR");

const somar = (xs: { total: Prisma.Decimal }[]) => xs.reduce((a, x) => a.add(x.total), new Prisma.Decimal(0));

export function montarSnapshot(e: DadosSnapshot): SnapshotPrestacao {
  const dataCorte = formatarDataBR(e.dataCorte);
  const nomeMes = `${MESES[e.mes - 1]} de ${e.ano}`;
  const totalEntradas = somar(e.entradas);
  const totalSaidas = somar(e.saidas);

  return {
    versaoSchema: 1,
    igreja: { nome: e.igreja.nome, logoUrl: e.igreja.logoUrl },
    ano: e.ano,
    mes: e.mes,
    rotulo: e.parcial ? `${nomeMes} (parcial, até ${dataCorte})` : nomeMes,
    parcial: e.parcial,
    dataCorte,
    resumo: {
      entradas: formatarBRL(totalEntradas),
      saidas: formatarBRL(totalSaidas),
      resultado: formatarBRL(totalEntradas.sub(totalSaidas)),
      saldoFimMes: formatarBRL(e.saldoFimMes),
    },
    entradas: [...e.entradas].sort(porTotalDesc).map((c) => ({ categoria: c.categoria, total: formatarBRL(c.total) })),
    saidas: [...e.saidas].sort(porTotalDesc).map((c) => {
      const saida = { categoria: c.categoria, total: formatarBRL(c.total) };
      if (!c.detalharPublico) return saida;
      const itens = [...c.itens]
        .sort((a, b) => a.data.getTime() - b.data.getTime())
        .map((i) => ({
          data: formatarDataBR(i.data),
          descricao: i.descricao?.trim() || "—",
          valor: formatarBRL(i.valor),
        }));
      return { ...saida, itens };
    }),
  };
}
