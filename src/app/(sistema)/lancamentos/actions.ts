"use server";

// Server Actions das telas de lançamentos e transferências. Cada uma obtém o ator da sessão
// (R16) e devolve `{ ok, ... }` ou `{ erro, campo?, regra? }`; os serviços decidem as permissões.
import { Validacao } from "@/lib/erros";
import { type ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { buscarMembros, criarMembro } from "@/lib/services/cadastros";
import { urlDoAnexo, anexarArquivo, MSG_TAMANHO, TAMANHO_MAXIMO } from "@/lib/services/anexos";
import {
  cancelarLancamento,
  criarLancamento,
  darBaixa,
  editarLancamento,
  type DadosLancamento,
} from "@/lib/services/lancamentos";
import { cancelarTransferencia, criarTransferencia, type DadosTransferencia } from "@/lib/services/transferencias";

export async function salvarLancamentoAction(dados: DadosLancamento): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarLancamento(ator, dados)).id }));
}

export async function editarLancamentoAction(id: string, dados: DadosLancamento): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await editarLancamento(ator, id, dados)).id }));
}

export async function darBaixaAction(id: string, data: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await darBaixa(ator, id, data);
    return {};
  });
}

export async function cancelarLancamentoAction(id: string, motivo: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await cancelarLancamento(ator, id, motivo);
    return {};
  });
}

/** Um arquivo por chamada (campo "arquivo"): mantém cada requisição abaixo do limite de corpo. */
export async function anexarArquivoAction(lancamentoId: string, dados: FormData): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    const arquivo = dados.get("arquivo");
    if (!(arquivo instanceof File)) throw new Validacao("Arquivo não recebido", { campo: "anexo", regra: "obrigatorio" });
    // Confere o tamanho ANTES de ler o conteúdo para a memória.
    if (arquivo.size > TAMANHO_MAXIMO) throw new Validacao(MSG_TAMANHO, { campo: "anexo", regra: "tamanho" });
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    await anexarArquivo(ator, lancamentoId, { nome: arquivo.name, mime: arquivo.type, dados: buffer });
    return {};
  });
}

export async function urlAnexoAction(anexoId: string): Promise<ResultadoAcao<{ url: string }>> {
  return executar(async (ator) => ({ url: await urlDoAnexo(ator, anexoId) }));
}

export type MembroOpcao = { id: string; nome: string };

export async function buscarMembrosAction(termo: string): Promise<ResultadoAcao<{ membros: MembroOpcao[] }>> {
  return executar(async (ator) => {
    const lista = await buscarMembros(ator, String(termo ?? "").slice(0, 80));
    return { membros: lista.map((m) => ({ id: m.id, nome: m.nome })) };
  });
}

export async function cadastrarMembroRapidoAction(nome: string, telefone: string): Promise<ResultadoAcao<{ membro: MembroOpcao }>> {
  return executar(async (ator) => {
    const m = await criarMembro(ator, { nome, telefone: telefone.trim() || null }, { origem: "rapido" });
    return { membro: { id: m.id, nome: m.nome } };
  });
}

export async function criarTransferenciaAction(dados: DadosTransferencia): Promise<ResultadoAcao<{ id: string }>> {
  return executar(async (ator) => ({ id: (await criarTransferencia(ator, dados)).id }));
}

export async function cancelarTransferenciaAction(id: string, motivo: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await cancelarTransferencia(ator, id, motivo);
    return {};
  });
}
