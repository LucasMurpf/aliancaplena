// Envio de um comprovante pelo navegador (sem React): preparar → PUT direto no storage → confirmar.
// O arquivo nunca passa pelo servidor do app (a Vercel limita o corpo das requisições a 4,5 MB).

/** URL de envio do storage em memória (dev/testes) e a rota local que a recebe fora de produção. */
export const PREFIXO_ENVIO_MEMORIA = "memoria-put://";
export const ROTA_ENVIO_MEMORIA = "/api/anexos-memoria";

type Resultado<T extends object = object> = ({ ok: true } & T) | { ok?: false; erro: string };

export type DepsEnvioAnexo = {
  preparar: (
    lancamentoId: string,
    arquivo: { nome: string; mime: string; tamanho: number },
  ) => Promise<Resultado<{ chave: string; url: string }>>;
  confirmar: (lancamentoId: string, chave: string, nome: string) => Promise<Resultado>;
  fetch?: typeof fetch;
};

/** No modo memória, o PUT vai para a rota local de dev em vez de uma URL do R2. */
export function destinoDoEnvio(url: string): string {
  if (!url.startsWith(PREFIXO_ENVIO_MEMORIA)) return url;
  return `${ROTA_ENVIO_MEMORIA}?chave=${encodeURIComponent(url.slice(PREFIXO_ENVIO_MEMORIA.length))}`;
}

/** Envia um arquivo. Devolve `{ ok: false }` em qualquer falha do caminho (ou lança, em erro de rede). */
export async function enviarUmAnexo(
  lancamentoId: string,
  arquivo: { name: string; type: string; size: number } & Blob,
  deps: DepsEnvioAnexo,
): Promise<{ ok: boolean }> {
  const mime = arquivo.type;
  const p = await deps.preparar(lancamentoId, { nome: arquivo.name, mime, tamanho: arquivo.size });
  if (!p.ok) return { ok: false };
  const resposta = await (deps.fetch ?? fetch)(destinoDoEnvio(p.url), {
    method: "PUT",
    body: arquivo,
    headers: { "Content-Type": mime },
  });
  if (!resposta.ok) return { ok: false };
  const c = await deps.confirmar(lancamentoId, p.chave, arquivo.name);
  return { ok: c.ok === true };
}
