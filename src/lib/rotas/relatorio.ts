// Leitura dos parâmetros e busca do relatório, compartilhadas pelas rotas de PDF e CSV.
import { Validacao } from "@/lib/erros";
import { hojeSP, limitesDoMes } from "@/lib/datas";
import { TIPOS_RELATORIO, type TipoRelatorio } from "@/lib/pdf/dados";
import type { UsuarioAtual } from "@/lib/auth";
import {
  relatorioArrecadacao,
  relatorioContribuicoes,
  relatorioDespesas,
  relatorioGeral,
  type RelatorioArrecadacao,
  type RelatorioContribuicoes,
  type RelatorioDespesas,
  type RelatorioGeral,
} from "@/lib/services/relatorios";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const ehTipoRelatorio = (t: string): t is TipoRelatorio => (TIPOS_RELATORIO as readonly string[]).includes(t);

export type ParametrosRelatorio = { de: string; ate: string; contaId?: string; categoriaId?: string; incluirPrevistos: boolean; membroId?: string };

/** `de`/`ate` em aaaa-mm-dd (padrão: do dia 1 do mês até hoje, fuso de São Paulo). */
export function lerParametros(url: string): ParametrosRelatorio {
  const q = new URL(url).searchParams;
  const hoje = hojeSP();
  const padraoDe = limitesDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1).inicio.toISOString().slice(0, 10);
  const de = q.get("de") || padraoDe;
  const ate = q.get("ate") || hoje.toISOString().slice(0, 10);
  if (!ISO.test(de)) throw new Validacao("Data inicial inválida", { campo: "de" });
  if (!ISO.test(ate)) throw new Validacao("Data final inválida", { campo: "ate" });
  return {
    de,
    ate,
    contaId: q.get("contaId") || undefined,
    categoriaId: q.get("categoriaId") || undefined,
    incluirPrevistos: q.get("incluirPrevistos") === "1",
    membroId: q.get("membroId") || undefined,
  };
}

export type DadosPorTipo = {
  geral: RelatorioGeral;
  arrecadacao: RelatorioArrecadacao;
  despesas: RelatorioDespesas;
  contribuicoes: RelatorioContribuicoes;
};

export async function buscarRelatorio<T extends TipoRelatorio>(ator: UsuarioAtual, tipo: T, p: ParametrosRelatorio): Promise<DadosPorTipo[T]> {
  const f = { de: p.de, ate: p.ate, contaId: p.contaId, categoriaId: p.categoriaId };
  const r =
    tipo === "geral"
      ? await relatorioGeral(ator, { ...f, incluirPrevistos: p.incluirPrevistos })
      : tipo === "arrecadacao"
        ? await relatorioArrecadacao(ator, f)
        : tipo === "despesas"
          ? await relatorioDespesas(ator, f)
          : await relatorioContribuicoes(ator, { ...f, membroId: p.membroId });
  return r as DadosPorTipo[T];
}
