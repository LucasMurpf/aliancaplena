// Filtros dos relatórios ↔ parâmetros da URL (funções puras, sem dependências de servidor).
export type TipoRelatorioTela = "geral" | "arrecadacao" | "despesas" | "contribuicoes";

export type FiltrosRelatorioUrl = {
  /** aaaa-mm-dd */
  de: string;
  /** aaaa-mm-dd */
  ate: string;
  contaId?: string;
  categoriaId?: string;
  incluirPrevistos: boolean;
  membroId?: string;
};

type ParametrosUrl = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string | undefined {
  const t = (Array.isArray(v) ? v[0] : v)?.trim();
  return t ? t : undefined;
}

function dataValida(v: string | undefined): string | undefined {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v ? v : undefined;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lê a URL de forma tolerante (nunca lança). Sem `de`/`ate` válidos usa o mês de `hoje`
 * (meia-noite UTC do dia civil em São Paulo), do dia 1 ao último dia.
 */
export function lerFiltrosRelatorio(sp: ParametrosUrl, tipo: TipoRelatorioTela, hoje: Date): FiltrosRelatorioUrl {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const f: FiltrosRelatorioUrl = {
    de: dataValida(primeiro(sp.de)) ?? iso(new Date(Date.UTC(ano, mes, 1))),
    ate: dataValida(primeiro(sp.ate)) ?? iso(new Date(Date.UTC(ano, mes + 1, 0))),
    incluirPrevistos: tipo === "geral" && primeiro(sp.incluirPrevistos) === "1",
  };
  const contaId = primeiro(sp.contaId);
  const categoriaId = primeiro(sp.categoriaId);
  const membroId = tipo === "contribuicoes" ? primeiro(sp.membroId) : undefined;
  if (contaId) f.contaId = contaId;
  if (categoriaId) f.categoriaId = categoriaId;
  if (membroId) f.membroId = membroId;
  return f;
}

/** Query string (sem "?") igual à das rotas de PDF/CSV. */
export function queryRelatorio(f: FiltrosRelatorioUrl): string {
  const q = new URLSearchParams({ de: f.de, ate: f.ate });
  if (f.contaId) q.set("contaId", f.contaId);
  if (f.categoriaId) q.set("categoriaId", f.categoriaId);
  if (f.incluirPrevistos) q.set("incluirPrevistos", "1");
  if (f.membroId) q.set("membroId", f.membroId);
  return q.toString();
}
