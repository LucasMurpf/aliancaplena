// Erros de Server Actions no navegador: mede como o erro foi (campo/regra) e devolve o que mostrar.
import { rastrear } from "@/lib/metricas/cliente";

export type ErroAcao = { erro: string; campo?: string; regra?: string; inesperado?: boolean };

export function registrarErroAcao(r: ErroAcao): void {
  if (r.campo || r.regra) rastrear("erro_validacao", { campo: r.campo || "geral", regra: r.regra || "outra" });
  if (r.inesperado) rastrear("erro_inesperado", { campo: "cadastro" });
}
