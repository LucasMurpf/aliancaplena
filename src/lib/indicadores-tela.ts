// Adaptador da tela de Indicadores: converte o resultado do serviço (Decimal) em objetos
// simples e serializáveis para os componentes cliente. Dinheiro vira `texto` (R$ formatado,
// o que se exibe) + `valor` (number, apenas para geometria dos gráficos, nunca exibido).
// Sem import de Prisma em tempo de execução além do formatador de dinheiro.
import type { Prisma } from "@prisma/client";
import { formatarBRL } from "@/lib/dinheiro";
import type { Comparativo, Indicadores } from "@/lib/services/indicadores";

export type Valor = { texto: string; valor: number };

/**
 * Decisão de cor: variações de entradas e de saídas usam a MESMA cor neutra; o sentido
 * (alta/queda) é dado só pela seta e pelo texto. Subir saída não é "bom" nem "ruim" por si
 * (pode ser obra planejada), e vermelho/verde também falha para daltônicos.
 */
export type Direcao = "alta" | "queda" | "estavel" | "nenhuma";
export type Variacao = { texto: string; direcao: Direcao; leitura: string };

export type MesTela = {
  rotulo: string;
  rotuloLongo: string;
  entradas: Valor;
  saidas: Valor;
  resultado: Valor;
  saldoFim: Valor;
  contribuintes: number;
};
export type ComparacaoTela = { texto: string; variacao: Variacao };
export type CartaoTela = { atual: string; anoAnterior: ComparacaoTela; media12: ComparacaoTela };
export type TelaIndicadores = {
  vazio: boolean;
  meses: MesTela[];
  categorias: { nome: string; valores: Valor[] }[];
  comparativos: { entradas: CartaoTela; saidas: CartaoTela };
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function valor(d: Prisma.Decimal): Valor {
  return { texto: formatarBRL(d), valor: d.toNumber() };
}

function percentualBR(abs: Prisma.Decimal): string {
  const [inteiro, dec] = abs.toFixed(1).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

export function formatarVariacao(v: Prisma.Decimal | null): Variacao {
  if (v === null) return { texto: "—", direcao: "nenhuma", leitura: "sem base de comparação" };
  const num = percentualBR(v.abs());
  if (v.isZero()) return { texto: `${num}%`, direcao: "estavel", leitura: "sem variação" };
  if (v.isPositive()) return { texto: `+${num}%`, direcao: "alta", leitura: `aumento de ${num}%` };
  return { texto: `−${num}%`, direcao: "queda", leitura: `redução de ${num}%` };
}

function cartao(c: Comparativo): CartaoTela {
  return {
    atual: formatarBRL(c.atual),
    anoAnterior: { texto: formatarBRL(c.mesmoMesAnoAnterior), variacao: formatarVariacao(c.varAnoAnterior) },
    media12: { texto: formatarBRL(c.media12), variacao: formatarVariacao(c.varMedia) },
  };
}

export function adaptarIndicadores(i: Indicadores): TelaIndicadores {
  const meses: MesTela[] = i.meses.map((m) => ({
    rotulo: m.rotulo,
    rotuloLongo: `${MESES[m.mes - 1]} de ${m.ano}`,
    entradas: valor(m.entradas),
    saidas: valor(m.saidas),
    resultado: valor(m.resultado),
    saldoFim: valor(m.saldoFim),
    contribuintes: m.contribuintes,
  }));
  const vazio = i.meses.every((m) => m.entradas.isZero() && m.saidas.isZero());
  return {
    vazio,
    meses,
    categorias: i.porCategoria.map((c) => ({ nome: c.categoria, valores: c.valores.map(valor) })),
    comparativos: { entradas: cartao(i.comparativos.entradas), saidas: cartao(i.comparativos.saidas) },
  };
}

/** Rótulo curto de eixo ("R$ 1,5 mil"). Recebe número de geometria, nunca é fonte de valor exibido em texto de dados. */
export function compactoBRL(n: number): string {
  const abs = Math.abs(n);
  const sinal = n < 0 ? "−" : "";
  const fmt = (x: number) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (abs >= 1_000_000) return `${sinal}R$ ${fmt(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${fmt(abs / 1_000)} mil`;
  return `${sinal}R$ ${Math.round(abs)}`;
}
