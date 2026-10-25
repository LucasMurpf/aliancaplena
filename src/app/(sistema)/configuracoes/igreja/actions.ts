"use server";

// Server Actions da tela Dados da igreja (somente Admin: decidido no serviço).
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarConfiguracao, type DadosConfiguracao } from "@/lib/services/configuracao";

export async function atualizarConfiguracaoAction(dados: DadosConfiguracao): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarConfiguracao(ator, dados);
    return {};
  });
}
