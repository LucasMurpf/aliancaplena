// POST /api/uso: recebe lotes de eventos de uso. Responde sempre 204, nunca revela falhas.
import { obterUsuarioAtual } from "@/lib/auth";
import { registrarEventos, type EventoRecebido } from "@/lib/services/metricas";

export const TAMANHO_MAX_CORPO = 64 * 1024;

const semConteudo = () => new Response(null, { status: 204 });

export async function POST(request: Request): Promise<Response> {
  try {
    const declarado = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > TAMANHO_MAX_CORPO) return semConteudo();
    const texto = await request.text();
    if (Buffer.byteLength(texto) > TAMANHO_MAX_CORPO) return semConteudo();
    const ator = await obterUsuarioAtual();
    if (!ator) return semConteudo();
    const corpo: unknown = JSON.parse(texto);
    const eventos = (corpo as { eventos?: unknown })?.eventos;
    if (!Array.isArray(eventos)) return semConteudo();
    await registrarEventos(ator, eventos as EventoRecebido[]);
  } catch {
    // Métricas nunca devem causar erro visível.
  }
  return semConteudo();
}
