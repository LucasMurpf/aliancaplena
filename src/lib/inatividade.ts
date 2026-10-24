// Estado da sessão conforme o tempo desde a última renovação bem-sucedida (sem imports de servidor).
// O cookie vale 15 min a partir da última renovação; o cliente age antes, para ainda ter cookie válido
// ao enviar o evento `sessao_expirou` e chamar o logout.
export const AVISO_MS = 14 * 60 * 1000;
export const EXPIRAR_MS = 14 * 60 * 1000 + 45 * 1000;
/** Intervalo mínimo entre renovações disparadas por atividade. */
export const INTERVALO_RENOVACAO_MS = 30 * 1000;

export type EstadoInatividade = "ativo" | "aviso" | "expirar";

export function estadoInatividade(msDesdeRenovacao: number): EstadoInatividade {
  if (msDesdeRenovacao >= EXPIRAR_MS) return "expirar";
  if (msDesdeRenovacao >= AVISO_MS) return "aviso";
  return "ativo";
}

/**
 * Ms desde a renovação mais recente entre as marcas conhecidas (esta aba e as outras, via localStorage).
 * Marcas ausentes/inválidas são ignoradas; sem nenhuma marca, devolve 0 (não expira por falta de dados).
 */
export function msDesdeUltimaRenovacao(agora: number, ...marcas: (number | null | undefined)[]): number {
  const validas = marcas.filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m <= agora);
  if (validas.length === 0) return 0;
  return agora - Math.max(...validas);
}

/** Aba parada não pode derrubar a sessão se outra aba renovou: decide só pelo estado compartilhado. */
export function deveEncerrar(agora: number, ultimaLocal: number, ultimaCompartilhada: number | null): boolean {
  return estadoInatividade(msDesdeUltimaRenovacao(agora, ultimaLocal, ultimaCompartilhada)) === "expirar";
}
