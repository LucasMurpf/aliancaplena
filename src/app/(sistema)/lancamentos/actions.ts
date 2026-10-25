"use server";

// Server Actions das telas de lançamentos e transferências. Cada uma obtém o ator da sessão
// (R16) e devolve `{ ok, ... }` ou `{ erro, campo?, regra? }`; os serviços decidem as permissões.
import { type ResultadoAcao } from "@/lib/acoes";
import { executar } from "@/lib/executar-acao";
import { buscarMembros, criarMembro } from "@/lib/services/cadastros";
import { confirmarAnexo, prepararAnexo, urlDoAnexo } from "@/lib/services/anexos";
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

/** 1º passo do anexo: devolve a URL assinada para o navegador enviar o arquivo direto ao storage. */
export async function prepararAnexoAction(
  lancamentoId: string,
  arquivo: { nome: string; mime: string; tamanho: number },
): Promise<ResultadoAcao<{ chave: string; url: string }>> {
  return executar((ator) => prepararAnexo(ator, lancamentoId, arquivo));
}

/** 2º passo, depois do PUT: confere o arquivo no storage e grava o anexo. */
export async function confirmarAnexoAction(lancamentoId: string, chave: string, nome: string): Promise<ResultadoAcao> {
  return executar(async (ator) => {
    await confirmarAnexo(ator, lancamentoId, chave, nome);
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
