// Armazenamento de anexos: Cloudflare R2 (compatível com S3) em produção, memória em testes/dev.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Storage {
  enviar(chave: string, dados: Buffer, mime: string): Promise<void>;
  urlAssinada(chave: string, segundos: number): Promise<string>;
}

export type StorageMemoria = Storage & { arquivos: Map<string, Buffer> };

export function storageMemoria(): StorageMemoria {
  const arquivos = new Map<string, Buffer>();
  return {
    arquivos,
    async enviar(chave, dados) {
      arquivos.set(chave, dados);
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
  });
  return {
    async enviar(chave, dados, mime) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: chave, Body: dados, ContentType: mime }));
    },
    urlAssinada(chave, segundos) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: chave }), { expiresIn: segundos });
    },
  };
}

let memoriaCompartilhada: StorageMemoria | null = null;
let avisou = false;

export function obterStorage(): Storage {
  if (VARIAVEIS_R2.every((v) => process.env[v])) return storageR2();
  if (!avisou && process.env.NODE_ENV !== "test") {
    avisou = true;
    console.warn("[storage] Variáveis R2_* ausentes: anexos ficarão apenas em memória (não persistem).");
  }
  return (memoriaCompartilhada ??= storageMemoria());
}
