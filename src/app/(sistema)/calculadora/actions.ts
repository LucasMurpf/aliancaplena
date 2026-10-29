"use server";

// Server Actions da calculadora de cédulas. Cada uma obtém o ator da sessão (R16) e devolve
// `{ ok, ... }` ou `{ erro, campo?, regra? }`; os serviços decidem as permissões.
import { type ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { formatarBRL } from "@/lib/dinheiro";
import { registrarContagem, valorEsperado, type DadosContagem, type DadosEsperado } from "@/lib/services/contagens";

/** Esperado já formatado e em centavos inteiros (o Decimal não atravessa para o cliente). */
export async function esperadoAction(dados: DadosEsperado): Promise<ResultadoAcao<{ texto: string; centavos: number }>> {
  return executar(async (ator) => {
    const esperado = await valorEsperado(ator, dados);
    return { texto: formatarBRL(esperado), centavos: Number(esperado.mul(100).toFixed(0)) };
  });
}

export async function registrarContagemAction(dados: DadosContagem): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await registrarContagem(ator, dados)).id }));
}
