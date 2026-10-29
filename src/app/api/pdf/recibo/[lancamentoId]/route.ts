// GET /api/pdf/recibo/:lancamentoId — emite (idempotente) e baixa o recibo em PDF (A5).
import { createElement } from "react";
import { obterUsuarioAtual } from "@/lib/auth";
import { Recibo } from "@/lib/pdf/Recibo";
import { renderizarPdf } from "@/lib/pdf/renderizar";
import { carregarLogo } from "@/lib/pdf/logo";
import { respostaArquivo, respostaDeErro, registrarRelatorioGerado, semSessao } from "@/lib/rotas/download";
import { emitirRecibo } from "@/lib/services/recibos";

export async function GET(_request: Request, ctx: { params: Promise<{ lancamentoId: string }> }): Promise<Response> {
  try {
    const ator = await obterUsuarioAtual();
    if (!ator) return semSessao();
    const { lancamentoId } = await ctx.params;
    const dados = await emitirRecibo(ator, lancamentoId);
    const logo = await carregarLogo(dados.igreja.logoUrl);
    const pdf = await renderizarPdf(createElement(Recibo, { dados, logo }));
    await registrarRelatorioGerado(ator, "recibo", "pdf");
    return respostaArquivo(pdf, "application/pdf", `recibo-${dados.numeroFormatado.replace("/", "-")}.pdf`);
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
