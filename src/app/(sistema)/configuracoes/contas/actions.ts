"use server";

// Server Actions da tela de contas. Os serviços decidem as permissões (cadastros.gerenciar).
import type { TipoConta } from "@prisma/client";
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarConta, criarConta, definirContaAtiva } from "@/lib/services/cadastros";

export type DadosContaTela = { nome: string; tipo: TipoConta; saldoInicial: string };

export async function criarContaAction(dados: DadosContaTela): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarConta(ator, dados)).id }));
}

export async function atualizarContaAction(id: string, dados: DadosContaTela): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarConta(ator, id, dados);
    return {};
  });
}

export async function definirContaAtivaAction(id: string, ativa: boolean): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await definirContaAtiva(ator, id, ativa);
    return {};
  });
}
