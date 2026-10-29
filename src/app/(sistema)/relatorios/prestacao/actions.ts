"use server";

// Server Actions da prestação de contas. As permissões (financeiro.lancar) são decididas no serviço.
import type { ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { despublicarPrestacao, publicarPrestacao } from "@/lib/services/prestacao";

export async function publicarPrestacaoAction(ano: number, mes: number): Promise<ResultadoAcao<{ token: string; versao: number }>> {
  return executar(async (ator) => {
    const p = await publicarPrestacao(ator, ano, mes);
    return { token: p.token, versao: p.versao };
  });
}

export async function despublicarPrestacaoAction(id: string, motivo: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await despublicarPrestacao(ator, id, motivo);
    return {};
  });
}
