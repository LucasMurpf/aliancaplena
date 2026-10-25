// Armazenamento de anexos: Cloudflare R2 (compatível com S3) em produção, memória em testes/dev.
// O navegador envia o arquivo direto ao storage por uma URL assinada (PUT); o servidor do app
// nunca recebe o corpo do arquivo (a Vercel limita o corpo das requisições a 4,5 MB).
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PREFIXO_ENVIO_MEMORIA } from "@/lib/envio-anexo";

export type InfoObjeto = { tamanho: number; mime: string };

export interface Storage {
  /** URL para o navegador enviar o arquivo com PUT; só aceita exatamente esse Content-Type e tamanho. */
  urlEnvio(chave: string, mime: string, tamanho: number, segundos: number): Promise<string>;
  /** Tamanho e tipo do objeto já enviado, ou `null` se ele não existe. */
  inspecionar(chave: string): Promise<InfoObjeto | null>;
  /** Primeiros `bytes` do objeto (para conferir a assinatura do arquivo). */
  lerInicio(chave: string, bytes: number): Promise<Buffer>;
  remover(chave: string): Promise<void>;
  /** URL temporária para abrir o arquivo. */
  urlAssinada(chave: string, segundos: number): Promise<string>;
}

export type StorageMemoria = Storage & {
  arquivos: Map<string, { dados: Buffer; mime: string }>;
  /** Simula o PUT na URL assinada: só aceita chave com envio autorizado, mesmo tipo e mesmo tamanho. */
  receberEnvio(chave: string, dados: Buffer, mime: string): void;
};

export function storageMemoria(): StorageMemoria {
  const arquivos = new Map<string, { dados: Buffer; mime: string }>();
  const autorizados = new Map<string, { mime: string; tamanho: number }>();
  return {
    arquivos,
    async urlEnvio(chave, mime, tamanho) {
      autorizados.set(chave, { mime, tamanho });
      return `${PREFIXO_ENVIO_MEMORIA}${chave}`;
    },
    receberEnvio(chave, dados, mime) {
      const a = autorizados.get(chave);
      if (!a || a.mime !== mime || a.tamanho !== dados.length) throw new Error("Envio não autorizado");
      autorizados.delete(chave);
      arquivos.set(chave, { dados, mime });
    },
    async inspecionar(chave) {
      const a = arquivos.get(chave);
      return a ? { tamanho: a.dados.length, mime: a.mime } : null;
    },
    async lerInicio(chave, bytes) {
      return Buffer.from(arquivos.get(chave)?.dados.subarray(0, bytes) ?? Buffer.alloc(0));
    },
    async remover(chave) {
      arquivos.delete(chave);
      autorizados.delete(chave);
    },
    async urlAssinada(chave, segundos) {
      return `memoria://${chave}?expira=${segundos}`;
    },
  };
}

const VARIAVEIS_R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export function storageR2(): Storage {
  const env = process.env;
  const bucket = env.R2_BUCKET as string;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    },
    // Sem checksums automáticos: num PUT assinado eles exigiriam cabeçalhos que o navegador não envia.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    urlEnvio(chave, mime, tamanho, segundos) {
      const comando = new PutObjectCommand({ Bucket: bucket, Key: chave, ContentType: mime, ContentLength: tamanho });
      // Content-Type e Content-Length entram na assinatura: o R2 recusa outro tipo ou tamanho.
      return getSignedUrl(client, comando, {
        expiresIn: segundos,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
    },
    async inspecionar(chave) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
        return { tamanho: r.ContentLength ?? 0, mime: r.ContentType ?? "" };
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || (e as Error).name === "NotFound" || (e as Error).name === "NoSuchKey") return null;
        throw e;
      }
    },
    async lerInicio(chave, bytes) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: chave, Range: `bytes=0-${bytes - 1}` }));
      const corpo = await r.Body?.transformToByteArray();
      return Buffer.from(corpo ?? new Uint8Array());
    },
    async remover(chave) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
    },
    urlAssinada(chave, segundos) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: chave }), { expiresIn: segundos });
    },
  };
}

export const MSG_STORAGE_NAO_CONFIGURADO =
  "Armazenamento de anexos não configurado: defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET";

// Em globalThis: no dev, a rota de envio em memória e as Server Actions podem carregar este
// módulo em instâncias separadas, mas precisam enxergar os mesmos arquivos.
const g = globalThis as typeof globalThis & { __anexosMemoria?: StorageMemoria; __anexosAvisou?: boolean };

/** Storage em memória compartilhado do processo (dev/testes). */
export function memoriaCompartilhada(): StorageMemoria {
  return (g.__anexosMemoria ??= storageMemoria());
}

export function obterStorage(): Storage {
  if (VARIAVEIS_R2.every((v) => process.env[v])) return storageR2();
  // Em produção, guardar em memória perderia os comprovantes sem ninguém perceber.
  if (process.env.NODE_ENV === "production") throw new Error(MSG_STORAGE_NAO_CONFIGURADO);
  if (!g.__anexosAvisou && process.env.NODE_ENV !== "test") {
    g.__anexosAvisou = true;
    console.warn("[storage] Variáveis R2_* ausentes: anexos ficarão apenas em memória (não persistem).");
  }
  return memoriaCompartilhada();
}
