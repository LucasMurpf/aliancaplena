// Anexos de lançamentos: o arquivo vai do navegador direto para o storage (URL assinada);
// o banco guarda só a chave e os metadados, depois de conferir o arquivo no storage.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StatusLancamento } from "@prisma/client";
import type { Anexo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { rastrearServidor } from "./metricas";
import { validar } from "./comum";
import { obterStorage, type Storage } from "@/lib/storage";
import { MSG_CANCELADO, MSG_LANCAMENTO_NAO_ENCONTRADO } from "./lancamentos";

export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const SEGUNDOS_URL = 300;
export const MSG_TIPO = "Tipo de arquivo não permitido";
export const MSG_TAMANHO = "Arquivo maior que 10 MB";
export const MSG_ANEXO_NAO_ENCONTRADO = "Anexo não encontrado";
export const MSG_NAO_RECEBIDO = "Arquivo não recebido. Envie de novo.";
export const MSG_CHAVE_INVALIDA = "Envio de arquivo inválido";
export const MSG_JA_CONFIRMADO = "Este arquivo já foi anexado";

const ascii = (b: Buffer, ini: number, fim: number) => b.subarray(ini, fim).toString("latin1");

// Confere os primeiros bytes com o tipo declarado (o MIME do cliente sozinho não é confiável).
const ASSINATURAS: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => ascii(b, 0, 4) === "%PDF",
  "image/png": (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "image/heic": (b) => b.length >= 12 && ascii(b, 4, 8) === "ftyp",
};

export function nomeParaChave(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "";
  const limpo = base
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|-+$/g, "")
    .slice(0, 100);
  return limpo || "arquivo";
}

const esquemaPreparo = z.object({
  nome: z.string({ error: "Nome do arquivo inválido" }),
  mime: z.string({ error: MSG_TIPO }),
  tamanho: z.number({ error: MSG_TAMANHO }),
});

/** Chave gerada por `prepararAnexo`: só caracteres seguros, sempre dentro da pasta do lançamento. */
const PADRAO_CHAVE = /^anexos\/[^/]+\/[a-zA-Z0-9._-]+$/;

const tipoMetrica = (mime: string) => (mime === "application/pdf" ? "pdf" : "imagem");

async function lancamentoAberto(lancamentoId: string) {
  const l = await prisma.lancamento.findUnique({ where: { id: lancamentoId } });
  if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (l.status === StatusLancamento.CANCELADO) throw new RegraDeNegocio(MSG_CANCELADO);
  return l;
}

/**
 * 1º passo do envio: confere permissão, lançamento, tipo e tamanho declarados e devolve uma URL
 * assinada para o navegador enviar o arquivo direto ao storage (o servidor não recebe o arquivo).
 */
export async function prepararAnexo(
  ator: UsuarioAtual | null,
  lancamentoId: string,
  arquivo: { nome: string; mime: string; tamanho: number },
  storage: Storage = obterStorage(),
): Promise<{ chave: string; url: string }> {
  exigir(ator, "financeiro.lancar");
  const a = validar(esquemaPreparo, arquivo, { campo: "anexo" });
  if (!Object.hasOwn(ASSINATURAS, a.mime)) throw new Validacao(MSG_TIPO, { campo: "anexo", regra: "tipo" });
  if (!Number.isSafeInteger(a.tamanho) || a.tamanho <= 0 || a.tamanho > TAMANHO_MAXIMO) {
    throw new Validacao(MSG_TAMANHO, { campo: "anexo", regra: "tamanho" });
  }
  await lancamentoAberto(lancamentoId);

  const chave = `anexos/${lancamentoId}/${randomUUID()}-${nomeParaChave(a.nome)}`;
  const url = await storage.urlEnvio(chave, a.mime, a.tamanho, SEGUNDOS_URL);
  return { chave, url };
}

/**
 * 2º passo, depois do PUT do navegador: confere no storage que o arquivo existe, o tamanho real e
 * os primeiros bytes contra o tipo gravado. Se algo falhar, o objeto é apagado. Só então grava
 * Anexo + log + métrica numa transação.
 */
export async function confirmarAnexo(
  ator: UsuarioAtual | null,
  lancamentoId: string,
  chave: string,
  nome: string,
  storage: Storage = obterStorage(),
): Promise<Anexo> {
  const quem = exigir(ator, "financeiro.lancar");
  // Chave de outro lançamento (ou forjada): recusa sem apagar nada, pois não é deste envio.
  if (typeof chave !== "string" || !chave.startsWith(`anexos/${lancamentoId}/`) || !PADRAO_CHAVE.test(chave)) {
    throw new Validacao(MSG_CHAVE_INVALIDA, { campo: "anexo", regra: "invalido" });
  }
  // Confirmação repetida: o arquivo já pertence a um anexo gravado, então não pode ser apagado.
  if (await prisma.anexo.findFirst({ where: { url: chave }, select: { id: true } })) {
    throw new Validacao(MSG_JA_CONFIRMADO, { campo: "anexo", regra: "duplicado" });
  }

  const recusar = async (erro: Error): Promise<never> => {
    await storage.remover(chave);
    throw erro;
  };

  try {
    await lancamentoAberto(lancamentoId);
  } catch (e) {
    return recusar(e as Error);
  }
  const info = await storage.inspecionar(chave);
  if (!info) throw new Validacao(MSG_NAO_RECEBIDO, { campo: "anexo", regra: "obrigatorio" });
  if (info.tamanho <= 0 || info.tamanho > TAMANHO_MAXIMO) {
    return recusar(new Validacao(MSG_TAMANHO, { campo: "anexo", regra: "tamanho" }));
  }
  const confere = Object.hasOwn(ASSINATURAS, info.mime) ? ASSINATURAS[info.mime] : undefined;
  if (!confere || !confere(await storage.lerInicio(chave, 16))) {
    return recusar(new Validacao(MSG_TIPO, { campo: "anexo", regra: "tipo" }));
  }

  const nomeArquivo = String(nome ?? "").trim().slice(0, 255) || "arquivo";
  try {
    return await prisma.$transaction(async (tx) => {
      const anexo = await tx.anexo.create({
        data: {
          lancamentoId,
          url: chave,
          nomeArquivo,
          mimeType: info.mime,
          tamanho: info.tamanho,
          enviadoPorId: quem.id,
        },
      });
      await registrarLog(tx, {
        entidade: "Lancamento",
        entidadeId: lancamentoId,
        acao: "ANEXOU",
        valorNovo: nomeArquivo,
        usuarioId: quem.id,
      });
      await rastrearServidor(tx, quem, "anexo_enviado", { tipo: tipoMetrica(info.mime) });
      return anexo;
    });
  } catch (e) {
    return recusar(e as Error);
  }
}

export async function urlDoAnexo(
  ator: UsuarioAtual | null,
  anexoId: string,
  storage: Storage = obterStorage(),
): Promise<string> {
  exigir(ator, "financeiro.ver");
  const a = await prisma.anexo.findUnique({ where: { id: anexoId } });
  if (!a) throw new NaoEncontrado(MSG_ANEXO_NAO_ENCONTRADO);
  return storage.urlAssinada(a.url, SEGUNDOS_URL);
}
