// PUT /api/anexos-memoria?chave=…: faz o papel da URL assinada do R2 quando o storage é a memória
// (dev sem R2_*). Em produção não existe (404): lá o navegador envia direto ao R2.
import { obterUsuarioAtual } from "@/lib/auth";
import { TAMANHO_MAXIMO } from "@/lib/services/anexos";
import { memoriaCompartilhada } from "@/lib/storage";

export async function PUT(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const ator = await obterUsuarioAtual();
  if (!ator) return new Response(null, { status: 401 });
  const chave = new URL(request.url).searchParams.get("chave") ?? "";
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO) return new Response(null, { status: 413 });
  const dados = Buffer.from(await request.arrayBuffer());
  try {
    // Só aceita chave com envio autorizado por prepararAnexo, com o mesmo tipo e tamanho.
    memoriaCompartilhada().receberEnvio(chave, dados, request.headers.get("content-type") ?? "");
  } catch {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 200 });
}
