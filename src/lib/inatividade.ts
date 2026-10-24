// Estado da sessão conforme o tempo parado (sem imports de servidor).
export const AVISO_MS = 14 * 60 * 1000;
export const EXPIRAR_MS = 15 * 60 * 1000;

export type EstadoInatividade = "ativo" | "aviso" | "expirar";

export function estadoInatividade(msParado: number): EstadoInatividade {
  if (msParado >= EXPIRAR_MS) return "expirar";
  if (msParado >= AVISO_MS) return "aviso";
  return "ativo";
}
