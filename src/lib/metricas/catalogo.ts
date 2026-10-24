// Catálogo fechado de eventos de uso. Só estas chaves de propriedades são aceitas por evento;
// todo o resto é descartado no servidor. Nunca incluir valores em R$, nomes, descrições ou ids.

export const CATALOGO = {
  login: [],
  sessao_expirou: [],
  tela_aberta: [],
  menu_aberto: ["item"],
  lancamento_iniciado: ["tipo"],
  lancamento_salvo: ["tipo", "comAnexo", "salvarELancarOutro", "viaAtalho"],
  lancamento_abandonado: ["tipo"],
  filtro_usado: ["filtro"],
  grafico_interagido: ["grafico"],
  erro_validacao: ["campo", "regra"],
  erro_inesperado: ["campo", "regra"],
  baixa_dada: [],
  lancamento_cancelado: [],
  transferencia_criada: [],
  anexo_enviado: ["tipo"],
  membro_cadastrado_rapido: ["origem"],
} as const satisfies Record<string, readonly string[]>;

export type NomeEvento = keyof typeof CATALOGO;
export type PropsEvento = Record<string, string | number | boolean>;

export const TAMANHO_MAX_STRING = 40;
export const TAMANHO_MAX_TELA = 120;

export function ehNomeEvento(nome: unknown): nome is NomeEvento {
  return typeof nome === "string" && Object.hasOwn(CATALOGO, nome);
}

export function sanitizarEvento(nome: string, props: unknown): { nome: NomeEvento; props: PropsEvento } | null {
  if (!ehNomeEvento(nome)) return null;
  const permitidas: readonly string[] = CATALOGO[nome];
  const saida: PropsEvento = {};
  if (props !== null && typeof props === "object" && !Array.isArray(props)) {
    for (const chave of permitidas) {
      if (!Object.hasOwn(props, chave)) continue;
      const v = (props as Record<string, unknown>)[chave];
      if (typeof v === "string" && v.length <= TAMANHO_MAX_STRING) saida[chave] = v;
      else if (typeof v === "number" && Number.isFinite(v)) saida[chave] = v;
      else if (typeof v === "boolean") saida[chave] = v;
    }
  }
  return { nome, props: saida };
}

const SEGMENTO_ID = /^(\d+|c[a-z0-9]{19,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Remove query/hash e troca segmentos que parecem id (cuid, uuid, número) por `[id]`. */
export function normalizarTela(rota: string): string {
  if (typeof rota !== "string") return "/";
  const caminho = rota.split(/[?#]/)[0];
  const segmentos = caminho.split("/").filter((s) => s !== "").map((s) => (SEGMENTO_ID.test(s) ? "[id]" : s));
  return ("/" + segmentos.join("/")).slice(0, TAMANHO_MAX_TELA);
}
