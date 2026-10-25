// Filtros da lista de lançamentos ↔ parâmetros da URL (funções puras).
import type { StatusLancamento, TipoMovimento } from "@prisma/client";
import { parseDataBR } from "@/lib/datas";
import { parsePagina } from "@/lib/paginacao";
import type { FiltroLancamentos } from "@/lib/services/lancamentos";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string | undefined {
  const t = (Array.isArray(v) ? v[0] : v)?.trim();
  return t ? t : undefined;
}

function dataValida(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  try {
    parseDataBR(v);
    return v;
  } catch {
    return undefined;
  }
}

// Listas literais (e não os enums do Prisma) para este módulo poder rodar no navegador.
const TIPOS: readonly TipoMovimento[] = ["ENTRADA", "SAIDA"];
const STATUS: readonly StatusLancamento[] = ["PREVISTO", "REALIZADO", "CANCELADO"];

function enumValido<T extends string>(lista: readonly T[], v: string | undefined): T | undefined {
  return lista.find((x) => x === v);
}

/** Lê a URL de forma tolerante: valor inválido é descartado (nunca derruba a página). */
export function parseFiltros(sp: ParametrosUrl): FiltroLancamentos {
  const f: FiltroLancamentos = {
    de: dataValida(primeiro(sp.de)),
    ate: dataValida(primeiro(sp.ate)),
    tipo: enumValido(TIPOS, primeiro(sp.tipo)),
    categoriaId: primeiro(sp.categoria),
    contaId: primeiro(sp.conta),
    status: enumValido(STATUS, primeiro(sp.status)),
    membroId: primeiro(sp.membro),
    busca: primeiro(sp.busca),
    pagina: parsePagina(primeiro(sp.pagina)),
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as FiltroLancamentos;
}

const PARAMETROS: [keyof FiltroLancamentos, string][] = [
  ["de", "de"],
  ["ate", "ate"],
  ["tipo", "tipo"],
  ["categoriaId", "categoria"],
  ["contaId", "conta"],
  ["status", "status"],
  ["membroId", "membro"],
  ["busca", "busca"],
];

/** Query string (sem "?") com só o que foi preenchido; a página 1 é omitida. */
export function filtrosParaQuery(f: FiltroLancamentos): string {
  const q = new URLSearchParams();
  for (const [chave, param] of PARAMETROS) {
    const v = f[chave];
    if (v !== undefined && v !== "") q.set(param, String(v));
  }
  if (f.pagina && f.pagina > 1) q.set("pagina", String(f.pagina));
  return q.toString();
}

/** Nomes (nunca valores) dos filtros em uso, para a métrica `filtro_usado`. */
export function nomesFiltrosAtivos(f: FiltroLancamentos): string[] {
  const nomes: string[] = [];
  if (f.de || f.ate) nomes.push("periodo");
  if (f.tipo) nomes.push("tipo");
  if (f.categoriaId) nomes.push("categoria");
  if (f.contaId) nomes.push("conta");
  if (f.status) nomes.push("status");
  if (f.membroId) nomes.push("membro");
  if (f.busca) nomes.push("busca");
  return nomes;
}
