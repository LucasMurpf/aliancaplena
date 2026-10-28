// Decide como entregar o PDF do recibo: compartilhar (celular), baixar, ou nada se o usuário cancelou.
export type ResultadoEntrega = "compartilhado" | "baixado" | "cancelado";

type Meios = {
  canShare?: (dados: { files: File[] }) => boolean;
  share: (dados: { files: File[]; title: string }) => Promise<void>;
  baixar: (arquivo: File) => void;
};

const ehAbort = (e: unknown) => typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";

/** Qualquer falha do compartilhamento que não seja cancelamento (ex.: NotAllowedError, ativação expirada) cai no download. */
export async function entregarArquivo(arquivo: File, meios: Meios, titulo = "Recibo"): Promise<ResultadoEntrega> {
  if (meios.canShare?.({ files: [arquivo] })) {
    try {
      await meios.share({ files: [arquivo], title: titulo });
      return "compartilhado";
    } catch (e) {
      if (ehAbort(e)) return "cancelado";
    }
  }
  meios.baixar(arquivo);
  return "baixado";
}
