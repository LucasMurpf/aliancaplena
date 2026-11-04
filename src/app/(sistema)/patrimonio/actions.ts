"use server";

// Server Actions do patrimônio. Os serviços decidem as permissões (patrimonio.gerenciar).
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarBem, criarBem, type DadosBem } from "@/lib/services/patrimonio";

export async function criarBemAction(dados: DadosBem): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarBem(ator, dados)).id }));
}

export async function atualizarBemAction(id: string, dados: DadosBem): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarBem(ator, id, dados);
    return {};
  });
}
