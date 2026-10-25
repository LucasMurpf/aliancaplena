"use server";

// Server Actions da tela de membros. Os serviços decidem as permissões (membros.gerenciar).
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarMembro, criarMembro, definirMembroAtivo } from "@/lib/services/cadastros";

export type DadosMembroTela = { nome: string; telefone: string | null; dataNascimento: string | null };

export async function criarMembroAction(dados: DadosMembroTela): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarMembro(ator, dados, { origem: "cadastro" })).id }));
}

export async function atualizarMembroAction(id: string, dados: DadosMembroTela): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarMembro(ator, id, dados);
    return {};
  });
}

export async function definirMembroAtivoAction(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await definirMembroAtivo(ator, id, ativo);
    return {};
  });
}
