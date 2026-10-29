// Pré-preenchimento do formulário de lançamento via URL (ex.: "Lançar ajuste" da calculadora).
// Cada parâmetro é validado; o que for inválido é ignorado em silêncio.
import type { TipoMovimento } from "@prisma/client";
import { parseValorBR } from "@/lib/dinheiro";

export type PrefillLancamento = {
  tipo?: TipoMovimento;
  contaId?: string;
  /** aaaa-mm-dd */
  data?: string;
  /** formato brasileiro, ex.: "12,34" */
  valor?: string;
  descricao?: string;
};

type Param = string | string[] | undefined;

const primeiro = (v: Param) => (Array.isArray(v) ? v[0] : v);

function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function lerPrefillLancamento(
  sp: Record<string, Param>,
  o: { contas: { id: string }[]; hoje: string },
): PrefillLancamento {
  const r: PrefillLancamento = {};
  const tipo = primeiro(sp.tipo);
  if (tipo === "ENTRADA" || tipo === "SAIDA") r.tipo = tipo;
  const conta = primeiro(sp.conta);
  if (conta && o.contas.some((c) => c.id === conta)) r.contaId = conta;
  const data = primeiro(sp.data);
  if (data && dataValida(data) && data <= o.hoje) r.data = data;
  const valor = primeiro(sp.valor);
  if (valor) {
    try {
      parseValorBR(valor);
      r.valor = valor.trim();
    } catch {
      /* ignora */
    }
  }
  const descricao = primeiro(sp.descricao)?.trim();
  if (descricao && descricao.length <= 200) r.descricao = descricao;
  return r;
}
