// Adaptador puro: resultados dos serviços (Decimal/Date) → estruturas só de texto para os PDFs.
// Os componentes de PDF não conhecem Prisma.
import type { Prisma } from "@prisma/client";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarDataBR } from "@/lib/datas";
import type {
  RelatorioArrecadacao,
  RelatorioContribuicoes,
  RelatorioDespesas,
  RelatorioGeral,
} from "@/lib/services/relatorios";

export type TipoRelatorio = "geral" | "arrecadacao" | "despesas" | "contribuicoes";
export const TIPOS_RELATORIO: readonly TipoRelatorio[] = ["geral", "arrecadacao", "despesas", "contribuicoes"];

export type ColunaPdf = { titulo: string; alinhar?: "esq" | "dir"; largura: number };
export type TabelaPdf = { titulo?: string; colunas: ColunaPdf[]; linhas: string[][]; rodape?: string[] };
export type RelatorioPdf = {
  titulo: string;
  periodo: string;
  /** Linhas do cabeçalho: "Conta: Caixa", "Inclui lançamentos previstos"… */
  filtros: string[];
  resumo: { rotulo: string; valor: string }[];
  tabelas: TabelaPdf[];
};

type Dados = {
  geral: RelatorioGeral;
  arrecadacao: RelatorioArrecadacao;
  despesas: RelatorioDespesas;
  contribuicoes: RelatorioContribuicoes;
};
export type OpcoesRelatorioPdf = { incluirPrevistos?: boolean };

export const AVISO_PREVISTOS = "Inclui lançamentos previstos";

const brl = (v: Prisma.Decimal) => formatarBRL(v);
const pct = (v: Prisma.Decimal) => `${v.toFixed(2).replace(".", ",")}%`;
const esq = (titulo: string, largura: number): ColunaPdf => ({ titulo, largura });
const dir = (titulo: string, largura: number): ColunaPdf => ({ titulo, largura, alinhar: "dir" });

function filtrosDe(d: { conta: string | null; categoria: string | null }): string[] {
  return [...(d.conta ? [`Conta: ${d.conta}`] : []), ...(d.categoria ? [`Categoria: ${d.categoria}`] : [])];
}

export function relatorioParaPdf<R extends TipoRelatorio>(tipo: R, dados: Dados[R], opcoes: OpcoesRelatorioPdf = {}): RelatorioPdf {
  const base = { periodo: dados.rotuloPeriodo, filtros: filtrosDe(dados) };
  switch (tipo) {
    case "geral": {
      const d = dados as RelatorioGeral;
      const comSituacao = !!opcoes.incluirPrevistos;
      const colunas = [
        esq("Data", 11),
        esq("Tipo", 9),
        esq("Categoria", 17),
        esq("Conta", 14),
        esq("Descrição", 26),
        ...(comSituacao ? [esq("Situação", 11)] : []),
        dir("Valor", 15),
      ];
      return {
        ...base,
        titulo: "Relatório geral",
        filtros: [...base.filtros, ...(comSituacao ? [AVISO_PREVISTOS] : [])],
        resumo: [
          { rotulo: "Entradas", valor: brl(d.totalEntradas) },
          { rotulo: "Saídas", valor: brl(d.totalSaidas) },
          { rotulo: "Resultado", valor: brl(d.resultado) },
        ],
        tabelas: [
          {
            colunas,
            linhas: d.linhas.map((l) => [
              formatarDataBR(l.data),
              l.tipo === "ENTRADA" ? "Entrada" : "Saída",
              l.categoria,
              l.conta,
              l.descricao ?? "",
              ...(comSituacao ? [l.previsto ? "Previsto" : "Realizado"] : []),
              brl(l.valor),
            ]),
          },
        ],
      };
    }
    case "arrecadacao": {
      const d = dados as RelatorioArrecadacao;
      return {
        ...base,
        titulo: "Arrecadação por categoria",
        resumo: [{ rotulo: "Total arrecadado", valor: brl(d.total) }],
        tabelas: [
          {
            colunas: [esq("Categoria", 46), dir("Lançamentos", 16), dir("% do total", 16), dir("Total", 22)],
            linhas: d.categorias.map((c) => [c.categoria, String(c.quantidade), pct(c.percentual), brl(c.total)]),
            rodape: ["Total", "", "", brl(d.total)],
          },
        ],
      };
    }
    case "despesas": {
      const d = dados as RelatorioDespesas;
      return {
        ...base,
        titulo: "Despesas por categoria",
        resumo: [{ rotulo: "Total de despesas", valor: brl(d.total) }],
        tabelas: d.grupos.map((g) => ({
          titulo: g.categoria,
          colunas: [esq("Data", 16), esq("Descrição", 44), esq("Conta", 22), dir("Valor", 18)],
          linhas: g.itens.map((i) => [formatarDataBR(i.data), i.descricao ?? "", i.conta, brl(i.valor)]),
          rodape: ["Subtotal", "", "", brl(g.subtotal)],
        })),
      };
    }
    case "contribuicoes": {
      const d = dados as RelatorioContribuicoes;
      if ("itens" in d) {
        return {
          ...base,
          titulo: "Contribuições individuais",
          filtros: [`Membro: ${d.membro}`, ...base.filtros],
          resumo: [{ rotulo: "Total no período", valor: brl(d.total) }],
          tabelas: [
            {
              colunas: [esq("Data", 25), esq("Categoria", 50), dir("Valor", 25)],
              linhas: d.itens.map((i) => [formatarDataBR(i.data), i.categoria, brl(i.valor)]),
              rodape: ["Total", "", brl(d.total)],
            },
          ],
        };
      }
      return {
        ...base,
        titulo: "Contribuições por membro",
        resumo: [{ rotulo: "Total no período", valor: brl(d.total) }],
        tabelas: [
          {
            colunas: [esq("Membro", 60), dir("Contribuições", 18), dir("Total", 22)],
            linhas: d.porMembro.map((m) => [m.membro, String(m.quantidade), brl(m.total)]),
            rodape: ["Total", "", brl(d.total)],
          },
        ],
      };
    }
    default:
      throw new Error("Relatório inválido");
  }
}

/** `relatorio-<tipo>-<de>_<ate>.<ext>` (datas em aaaa-mm-dd). */
export const nomeArquivoRelatorio = (tipo: TipoRelatorio, de: string, ate: string, ext: "pdf" | "csv") =>
  `relatorio-${tipo}-${de}_${ate}.${ext}`;

/** "dd/mm/aaaa hh:mm" no fuso de São Paulo. */
export function geradoEm(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/** Nome de arquivo seguro para o Content-Disposition (ASCII) e a forma UTF-8 (RFC 5987). */
export function cabecalhoDownload(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/** Linha de local e data do recibo: sem cidade configurada, só a data ("27 de outubro de 2026."). */
export function linhaLocalData(cidade: string | null | undefined, dataPorExtenso: string): string {
  const c = cidade?.trim();
  return c ? `${c}, ${dataPorExtenso}.` : `${dataPorExtenso}.`;
}
