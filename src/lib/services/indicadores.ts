// Indicadores: últimos 12 meses fechados + mês atual, só REALIZADOS, poucas consultas agregadas.
// Nunca devolve nome de membro: contribuintes é apenas uma contagem de membros distintos.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { saldoTotalEm } from "./prestacao";

export type MesIndicador = {
  ano: number;
  mes: number;
  rotulo: string;
  entradas: Prisma.Decimal;
  saidas: Prisma.Decimal;
  resultado: Prisma.Decimal;
  saldoFim: Prisma.Decimal;
  contribuintes: number;
};
export type Comparativo = {
  atual: Prisma.Decimal;
  mesmoMesAnoAnterior: Prisma.Decimal;
  media12: Prisma.Decimal;
  varAnoAnterior: Prisma.Decimal | null;
  varMedia: Prisma.Decimal | null;
};
export type Indicadores = {
  meses: MesIndicador[];
  porCategoria: { categoria: string; valores: Prisma.Decimal[] }[];
  comparativos: { entradas: Comparativo; saidas: Comparativo };
};

const ZERO = () => new Prisma.Decimal(0);
const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const TOP = 5;

/** (atual − base) / base × 100, meio-para-cima com 1 casa; null com base zero. */
function variacao(atual: Prisma.Decimal, base: Prisma.Decimal): Prisma.Decimal | null {
  if (base.isZero()) return null;
  return atual.sub(base).div(base).mul(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
}

function comparar(valores: Prisma.Decimal[]): Comparativo {
  const atual = valores[12];
  const anterior = valores[0];
  // Os 12 fechados são os índices 0..11.
  const mediaExata = valores.slice(0, 12).reduce((s, v) => s.add(v), ZERO()).div(12);
  return {
    atual,
    mesmoMesAnoAnterior: anterior,
    media12: mediaExata.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    varAnoAnterior: variacao(atual, anterior),
    varMedia: variacao(atual, mediaExata),
  };
}

type LinhaMes = { ano: number; mes: number; tipo: string; total: string };
type LinhaCat = { ano: number; mes: number; categoria: string; total: string };
type LinhaContrib = { ano: number; mes: number; n: number };

export async function indicadores(ator: UsuarioAtual | null, hoje: Date = hojeSP()): Promise<Indicadores> {
  exigir(ator, "financeiro.ver");

  // 13 meses: do mesmo mês do ano anterior até o atual.
  const anoAtual = hoje.getUTCFullYear();
  const mesAtual = hoje.getUTCMonth(); // 0-11
  const inicio = new Date(Date.UTC(anoAtual, mesAtual - 12, 1));
  const fim = new Date(Date.UTC(anoAtual, mesAtual + 1, 1)); // exclusivo
  const diaAntes = new Date(inicio.getTime() - 86_400_000);
  const chaves = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(anoAtual, mesAtual - 12 + i, 1));
    return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  });
  const idx = (ano: number, mes: number) => chaves.findIndex((c) => c.ano === ano && c.mes === mes);

  // dataRealizacao é DATE (sem fuso): date_trunc direto, sem conversão de timezone.
  const porMes = await prisma.$queryRaw<LinhaMes[]>`
    SELECT EXTRACT(YEAR FROM date_trunc('month', "dataRealizacao"))::int AS ano,
           EXTRACT(MONTH FROM date_trunc('month', "dataRealizacao"))::int AS mes,
           "tipo"::text AS tipo,
           SUM("valor")::text AS total
    FROM "Lancamento"
    WHERE "status" = 'REALIZADO' AND "dataRealizacao" >= ${inicio}::date AND "dataRealizacao" < ${fim}::date
    GROUP BY 1, 2, 3`;
  const porCat = await prisma.$queryRaw<LinhaCat[]>`
    SELECT EXTRACT(YEAR FROM date_trunc('month', l."dataRealizacao"))::int AS ano,
           EXTRACT(MONTH FROM date_trunc('month', l."dataRealizacao"))::int AS mes,
           c."nome" AS categoria,
           SUM(l."valor")::text AS total
    FROM "Lancamento" l JOIN "Categoria" c ON c."id" = l."categoriaId"
    WHERE l."status" = 'REALIZADO' AND l."tipo" = 'ENTRADA'
      AND l."dataRealizacao" >= ${inicio}::date AND l."dataRealizacao" < ${fim}::date
    GROUP BY 1, 2, c."id", c."nome"`;
  const contrib = await prisma.$queryRaw<LinhaContrib[]>`
    SELECT EXTRACT(YEAR FROM date_trunc('month', l."dataRealizacao"))::int AS ano,
           EXTRACT(MONTH FROM date_trunc('month', l."dataRealizacao"))::int AS mes,
           COUNT(DISTINCT l."membroId")::int AS n
    FROM "Lancamento" l JOIN "Categoria" c ON c."id" = l."categoriaId"
    WHERE l."status" = 'REALIZADO' AND l."tipo" = 'ENTRADA' AND c."nominal" = true
      AND l."membroId" IS NOT NULL
      AND l."dataRealizacao" >= ${inicio}::date AND l."dataRealizacao" < ${fim}::date
    GROUP BY 1, 2`;
  const saldoAntes = await saldoTotalEm(prisma, diaAntes);

  const entradas = chaves.map(() => ZERO());
  const saidas = chaves.map(() => ZERO());
  for (const l of porMes) {
    const i = idx(l.ano, l.mes);
    if (i < 0) continue;
    if (l.tipo === "ENTRADA") entradas[i] = new Prisma.Decimal(l.total);
    else saidas[i] = new Prisma.Decimal(l.total);
  }
  const contribuintes = chaves.map(() => 0);
  for (const l of contrib) {
    const i = idx(l.ano, l.mes);
    if (i >= 0) contribuintes[i] = Number(l.n);
  }

  let saldo = saldoAntes;
  const meses: MesIndicador[] = chaves.map((c, i) => {
    const resultado = entradas[i].sub(saidas[i]);
    saldo = saldo.add(resultado);
    return {
      ...c,
      rotulo: `${ABREV[c.mes - 1]}/${String(c.ano % 100).padStart(2, "0")}`,
      entradas: entradas[i],
      saidas: saidas[i],
      resultado,
      saldoFim: saldo,
      contribuintes: contribuintes[i],
    };
  });

  // Categorias: top 5 pelo total nos 13 meses; o resto soma em "Outras".
  const cats = new Map<string, Prisma.Decimal[]>();
  for (const l of porCat) {
    const i = idx(l.ano, l.mes);
    if (i < 0) continue;
    const v = cats.get(l.categoria) ?? chaves.map(() => ZERO());
    v[i] = v[i].add(new Prisma.Decimal(l.total));
    cats.set(l.categoria, v);
  }
  const totalDe = (v: Prisma.Decimal[]) => v.reduce((s, x) => s.add(x), ZERO());
  const ordenadas = [...cats.entries()].sort((a, b) => totalDe(b[1]).cmp(totalDe(a[1])) || a[0].localeCompare(b[0], "pt-BR"));
  const porCategoria = ordenadas.slice(0, TOP).map(([categoria, valores]) => ({ categoria, valores }));
  if (ordenadas.length > TOP) {
    const outras = chaves.map((_, i) => ordenadas.slice(TOP).reduce((s, [, v]) => s.add(v[i]), ZERO()));
    porCategoria.push({ categoria: "Outras", valores: outras });
  }

  return {
    meses,
    porCategoria,
    comparativos: { entradas: comparar(entradas), saidas: comparar(saidas) },
  };
}
