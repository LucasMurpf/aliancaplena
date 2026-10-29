// Apoio às rotas de download (PDF/CSV): respostas de arquivo, erros e métrica do servidor.
import { prisma } from "@/lib/db";
import { ErroApp } from "@/lib/erros";
import { cabecalhoDownload } from "@/lib/pdf/dados";
import { carregarLogo, type LogoPdf } from "@/lib/pdf/logo";
import { registrarEventos } from "@/lib/services/metricas";
import type { UsuarioAtual } from "@/lib/auth";

const SEM_CACHE = "private, no-store";

export function respostaArquivo(corpo: Buffer | string, tipo: string, nomeArquivo: string): Response {
  const bytes = typeof corpo === "string" ? Buffer.from(corpo, "utf8") : corpo;
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": cabecalhoDownload(nomeArquivo),
      "Content-Length": String(bytes.length),
      "Cache-Control": SEM_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function respostaTexto(status: number, texto: string): Response {
  return new Response(texto, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": SEM_CACHE } });
}

export const semSessao = () => respostaTexto(401, "É preciso entrar no sistema.");

/** NaoAutorizado → 403, NaoEncontrado → 404, Validacao/RegraDeNegocio → 400 (mensagem em texto); o resto → 500 sem detalhes. */
export function respostaDeErro(erro: unknown): Response {
  if (erro instanceof ErroApp) {
    const status = erro.codigo === "NAO_AUTORIZADO" ? 403 : erro.codigo === "NAO_ENCONTRADO" ? 404 : 400;
    return respostaTexto(status, erro.message);
  }
  console.error("[download] erro inesperado", erro instanceof Error ? erro.message : "erro");
  return respostaTexto(500, "Não foi possível gerar o arquivo.");
}

export type TipoMetricaRelatorio = "geral" | "arrecadacao" | "despesas" | "contribuicoes" | "recibo" | "prestacao";

/** Métrica `relatorio_gerado`; nunca falha a resposta. */
export async function registrarRelatorioGerado(ator: UsuarioAtual | null, relatorio: TipoMetricaRelatorio, formato: "pdf" | "csv"): Promise<void> {
  await registrarEventos(ator, [{ nome: "relatorio_gerado", tela: "/api", dispositivo: "PC", props: { relatorio, formato } }]);
}

/** Igreja (nome, CNPJ, logo já baixado) para o cabeçalho dos relatórios. */
export async function igrejaParaPdf(): Promise<{ nome: string; cnpj: string | null; logo: LogoPdf | null }> {
  const c = await prisma.configuracao.findFirst({ orderBy: { criadoEm: "asc" }, select: { nomeIgreja: true, cnpj: true, logoUrl: true } });
  return { nome: c?.nomeIgreja ?? "Igreja", cnpj: c?.cnpj ?? null, logo: await carregarLogo(c?.logoUrl) };
}
