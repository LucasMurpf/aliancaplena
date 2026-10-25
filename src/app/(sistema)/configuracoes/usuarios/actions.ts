"use server";

// Server Actions da tela de usuários (somente Admin: decidido no serviço).
import type { Papel } from "@prisma/client";
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { atualizarUsuario, criarUsuario, definirAtivo, redefinirSenha } from "@/lib/services/usuarios";

export type DadosUsuarioNovo = { nome: string; email: string; senha: string; papeis: Papel[] };
export type DadosUsuarioEdicao = { nome: string; email: string; papeis: Papel[] };

export async function criarUsuarioAction(dados: DadosUsuarioNovo): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarUsuario(ator, dados)).id }));
}

export async function atualizarUsuarioAction(id: string, dados: DadosUsuarioEdicao): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await atualizarUsuario(ator, id, dados);
    return {};
  });
}

export async function definirUsuarioAtivoAction(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await definirAtivo(ator, id, ativo);
    return {};
  });
}

export async function redefinirSenhaAction(id: string, novaSenha: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await redefinirSenha(ator, id, novaSenha);
    return {};
  });
}
