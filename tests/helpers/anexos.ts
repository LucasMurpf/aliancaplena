import type { UsuarioAtual } from "@/lib/auth";
import { confirmarAnexo, prepararAnexo } from "@/lib/services/anexos";
import type { StorageMemoria } from "@/lib/storage";

/** Fluxo completo do navegador com o storage em memória: preparar → PUT na URL assinada → confirmar. */
export async function enviarAnexoTeste(
  ator: UsuarioAtual | null,
  lancamentoId: string,
  arquivo: { nome: string; mime: string; dados: Buffer },
  st: StorageMemoria,
) {
  const { chave } = await prepararAnexo(ator, lancamentoId, { nome: arquivo.nome, mime: arquivo.mime, tamanho: arquivo.dados.length }, st);
  st.receberEnvio(chave, arquivo.dados, arquivo.mime);
  return confirmarAnexo(ator, lancamentoId, chave, arquivo.nome, st);
}
