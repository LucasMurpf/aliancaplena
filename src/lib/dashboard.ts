// Lógica pura do dashboard: mês da URL, navegação entre meses e agrupamento "top 6 + Outras".
import { Prisma } from "@prisma/client";

export type MesRef = { ano: number; mes: number };

const ANO_MIN = 2000;
const ANO_MAX = 2100;
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const LIMITE_CATEGORIAS = 6;

/** Lê `?mes=aaaa-mm`; qualquer valor inválido vira o mês de `hoje` (dia civil de SP). */
export function parseMes(param: string | string[] | undefined, hoje: Date): MesRef {
  const atual = { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 };
  const texto = Array.isArray(param) ? param[0] : param;
  const m = typeof texto === "string" ? /^(\d{4})-(\d{2})$/.exec(texto) : null;
  if (!m) return atual;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < ANO_MIN || ano > ANO_MAX || mes < 1 || mes > 12) return atual;
  return { ano, mes };
}

export function chaveMes({ ano, mes }: MesRef): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function rotuloMes({ ano, mes }: MesRef): string {
  return `${MESES[mes - 1]} de ${ano}`;
}

export function mesAnterior({ ano, mes }: MesRef): MesRef | null {
  const r = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return r.ano < ANO_MIN ? null : r;
}

export function mesSeguinte({ ano, mes }: MesRef): MesRef | null {
  const r = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return r.ano > ANO_MAX ? null : r;
}

export type ItemCategoria = { categoria: string; total: Prisma.Decimal; outras?: boolean };

/** Ordena por total (maior primeiro), mantém as 6 maiores e soma o restante em "Outras". */
export function agruparTopComOutras(itens: { categoria: string; total: Prisma.Decimal }[]): ItemCategoria[] {
  const ordenados = [...itens].sort(
    (a, b) => b.total.comparedTo(a.total) || a.categoria.localeCompare(b.categoria, "pt-BR"),
  );
  if (ordenados.length <= LIMITE_CATEGORIAS) return ordenados;
  const resto = ordenados.slice(LIMITE_CATEGORIAS).reduce((s, i) => s.add(i.total), new Prisma.Decimal(0));
  return [...ordenados.slice(0, LIMITE_CATEGORIAS), { categoria: "Outras", total: resto, outras: true }];
}
