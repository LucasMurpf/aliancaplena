"use server";

// Server Actions da tela de categorias. Os serviços decidem as permissões (cadastros.gerenciar).
import type { TipoMovimento } from "@prisma/client";
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarCategoria, criarCategoria, definirCategoriaAtiva } from "@/lib/services/cadastros";

export type DadosCategoriaTela = { nome: string; tipo: TipoMovimento; nominal: boolean; detalharPublico?: boolean };

export async function criarCategoriaAction(dados: DadosCategoriaTela): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarCategoria(ator, dados)).id }));
}

// O tipo não é enviado na edição: ele só se define na criação.
export async function atualizarCategoriaAction(id: string, dados: { nome: string; nominal: boolean; detalharPublico?: boolean }): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarCategoria(ator, id, dados);
    return {};
  });
}

export async function definirCategoriaAtivaAction(id: string, ativa: boolean): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await definirCategoriaAtiva(ator, id, ativa);
    return {};
  });
}
