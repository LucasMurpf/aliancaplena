// Funções puras das telas de prestação de contas (sem React nem servidor).
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "outubro de 2026". */
export function rotuloMesExtenso(ano: number, mes: number): string {
  return `${MESES[mes - 1]} de ${ano}`;
}

export function textoConfirmarPublicacao(ano: number, mes: number): string {
  return `Publicar a prestação de contas de ${rotuloMesExtenso(ano, mes)}? Os membros que receberem o link verão exatamente esta versão. Revise as descrições dos gastos detalhados antes de publicar.`;
}

/** Lê "aaaa-mm" do seletor; só o mês atual ou passado (`hoje` = dia civil em São Paulo, meia-noite UTC). */
export function lerMesEscolhido(texto: string, hoje: Date): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || ano < 2000) return null;
  const atual = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  return ano * 12 + (mes - 1) <= atual ? { ano, mes } : null;
}

export function urlPublicaPrestacao(origem: string, token: string): string {
  return `${origem.replace(/\/+$/, "")}/p/${token}`;
}

export type ResultadoLink = "compartilhado" | "copiado" | "cancelado";

type MeiosLink = {
  share?: (dados: { url: string; title: string }) => Promise<void>;
  copiar: (texto: string) => Promise<void>;
};

const ehAbort = (e: unknown) => typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";

/** Compartilha o link (Web Share); sem suporte ou se falhar (menos cancelar), copia. */
export async function entregarLink(url: string, titulo: string, meios: MeiosLink): Promise<ResultadoLink> {
  if (meios.share) {
    try {
      await meios.share({ url, title: titulo });
      return "compartilhado";
    } catch (e) {
      if (ehAbort(e)) return "cancelado";
    }
  }
  await meios.copiar(url);
  return "copiado";
}
