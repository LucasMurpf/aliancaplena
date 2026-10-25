// Estado e regras puras do formulário de lançamento (sem React): fácil de testar.
import type { TipoMovimento } from "@prisma/client";
import type { DadosLancamento } from "@/lib/services/lancamentos";

export type CategoriaForm = { id: string; nome: string; tipo: TipoMovimento; nominal: boolean };
export type MembroForm = { id: string; nome: string };

export type EstadoLancamento = {
  tipo: TipoMovimento;
  categoriaId: string;
  contaId: string;
  membro: MembroForm | null;
  /** Texto digitado, no formato brasileiro. */
  valor: string;
  descricao: string;
  /** aaaa-mm-dd. Com Realizado é a data do lançamento; com Previsto, o vencimento. */
  data: string;
  realizado: boolean;
};

/**
 * Deixa o texto do campo de valor no padrão brasileiro enquanto se digita:
 * só dígitos, "." e ","; ponto com 1–2 dígitos no fim vira vírgula (teclado numérico em
 * outro idioma); no máximo uma vírgula e 2 casas.
 */
export function normalizarValorDigitado(texto: string): string {
  let t = texto.replace(/[^\d.,]/g, "");
  if (!t.includes(",")) {
    const m = /^(.*)\.(\d{1,2})$/.exec(t);
    if (m && !m[1].includes(".")) t = `${m[1]},${m[2]}`;
    return t;
  }
  const i = t.indexOf(",");
  const inteiro = t.slice(0, i);
  const decimais = t.slice(i + 1).replace(/[.,]/g, "").slice(0, 2);
  return `${inteiro},${decimais}`;
}

export function estadoInicial(o: { hoje: string; contaId: string }): EstadoLancamento {
  return {
    tipo: "ENTRADA",
    categoriaId: "",
    contaId: o.contaId,
    membro: null,
    valor: "",
    descricao: "",
    data: o.hoje,
    realizado: true,
  };
}

/** Trocar Entrada/Saída: a categoria (e o membro) só ficam se ainda fizerem sentido. */
export function trocarTipo(e: EstadoLancamento, tipo: TipoMovimento, categorias: CategoriaForm[]): EstadoLancamento {
  if (e.tipo === tipo) return e;
  const ok = categorias.some((c) => c.id === e.categoriaId && c.tipo === tipo);
  return { ...e, tipo, categoriaId: ok ? e.categoriaId : "", membro: ok ? e.membro : null };
}

/** "Salvar e lançar outro": mantém tipo, conta, categoria, data (e situação); limpa o resto. */
export function aposSalvarELancarOutro(e: EstadoLancamento): EstadoLancamento {
  return { ...e, membro: null, valor: "", descricao: "" };
}

/** Dados para o serviço. `vencimentoOriginal`: na edição de um lançamento já realizado. */
export function montarDados(e: EstadoLancamento, categorias: CategoriaForm[], vencimentoOriginal?: string): DadosLancamento {
  const nominal = categorias.find((c) => c.id === e.categoriaId)?.nominal ?? false;
  return {
    tipo: e.tipo,
    valor: e.valor,
    categoriaId: e.categoriaId,
    contaId: e.contaId,
    membroId: nominal ? (e.membro?.id ?? null) : null,
    descricao: e.descricao,
    dataVencimento: e.realizado && vencimentoOriginal ? vencimentoOriginal : e.data,
    realizado: e.realizado,
    ...(e.realizado ? { dataRealizacao: e.data } : {}),
  };
}

/** Algo digitado/escolhido além do padrão? Usado para detectar abandono. */
export function formularioPreenchido(e: EstadoLancamento, anexos: number): boolean {
  return e.valor !== "" || e.descricao.trim() !== "" || e.membro !== null || anexos > 0;
}

/**
 * Envia os arquivos um a um e devolve os nomes dos que falharam. Nunca lança: uma exceção
 * (rede, corpo grande demais) conta como falha, pois o lançamento já está salvo nesse ponto.
 */
export async function enviarAnexos<A extends { name: string }>(
  arquivos: A[],
  enviar: (arquivo: A) => Promise<{ ok?: boolean }>,
): Promise<string[]> {
  const falhas: string[] = [];
  for (const arquivo of arquivos) {
    try {
      const r = await enviar(arquivo);
      if (!r.ok) falhas.push(arquivo.name);
    } catch {
      falhas.push(arquivo.name);
    }
  }
  return falhas;
}

/** Erro de um campo que existe na tela vai junto dele; senão vira mensagem geral (nunca se perde). */
export function destinoDoErro(
  campo: string | undefined,
  camposDaTela: readonly string[],
  mapa: Record<string, string> = {},
): string | null {
  if (!campo) return null;
  const chave = mapa[campo] ?? campo;
  return camposDaTela.includes(chave) ? chave : null;
}
