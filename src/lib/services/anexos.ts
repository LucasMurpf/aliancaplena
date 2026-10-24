// Anexos de lançamentos: o arquivo vai para o storage; o banco guarda só a chave e os metadados.
import { randomUUID } from "node:crypto";
import { StatusLancamento } from "@prisma/client";
import type { Anexo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { obterStorage, type Storage } from "@/lib/storage";
import { MSG_CANCELADO, MSG_LANCAMENTO_NAO_ENCONTRADO } from "./lancamentos";

export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const SEGUNDOS_URL = 300;
export const MSG_TIPO = "Tipo de arquivo não permitido";
export const MSG_TAMANHO = "Arquivo maior que 10 MB";
export const MSG_ANEXO_NAO_ENCONTRADO = "Anexo não encontrado";

export type Arquivo = { nome: string; mime: string; dados: Buffer };

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

export async function anexarArquivo(
  ator: UsuarioAtual | null,
  lancamentoId: string,
  arquivo: Arquivo,
  storage: Storage = obterStorage(),
): Promise<Anexo> {
  const quem = exigir(ator, "financeiro.lancar");

  const confere = ASSINATURAS[arquivo.mime];
  if (!confere || !confere(arquivo.dados)) throw new Validacao(MSG_TIPO);
  if (arquivo.dados.length > TAMANHO_MAXIMO) throw new Validacao(MSG_TAMANHO);

  const l = await prisma.lancamento.findUnique({ where: { id: lancamentoId } });
  if (!l) throw new NaoEncontrado(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (l.status === StatusLancamento.CANCELADO) throw new RegraDeNegocio(MSG_CANCELADO);

  const nomeArquivo = arquivo.nome.trim().slice(0, 255);
  const chave = `anexos/${lancamentoId}/${randomUUID()}-${nomeParaChave(arquivo.nome)}`;

  // Upload primeiro: nunca existe linha no banco apontando para arquivo ausente.
  await storage.enviar(chave, arquivo.dados, arquivo.mime);

  return prisma.$transaction(async (tx) => {
    const anexo = await tx.anexo.create({
      data: {
        lancamentoId,
        url: chave,
        nomeArquivo,
        mimeType: arquivo.mime,
        tamanho: arquivo.dados.length,
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
    return anexo;
  });
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
