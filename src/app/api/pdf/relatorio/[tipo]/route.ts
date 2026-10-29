// GET /api/pdf/relatorio/:tipo?de&ate&contaId&categoriaId&incluirPrevistos=1&membroId — relatório em PDF (A4).
import { createElement } from "react";
import { obterUsuarioAtual } from "@/lib/auth";
import { geradoEm, nomeArquivoRelatorio, relatorioParaPdf } from "@/lib/pdf/dados";
import { Relatorio } from "@/lib/pdf/Relatorio";
import { renderizarPdf } from "@/lib/pdf/renderizar";
import { igrejaParaPdf, registrarRelatorioGerado, respostaArquivo, respostaDeErro, respostaTexto, semSessao } from "@/lib/rotas/download";
import { buscarRelatorio, ehTipoRelatorio, lerParametros } from "@/lib/rotas/relatorio";

export async function GET(request: Request, ctx: { params: Promise<{ tipo: string }> }): Promise<Response> {
  try {
    const ator = await obterUsuarioAtual();
    if (!ator) return semSessao();
    const { tipo } = await ctx.params;
    if (!ehTipoRelatorio(tipo)) return respostaTexto(404, "Relatório não encontrado.");
    const p = lerParametros(request.url);
    const dados = await buscarRelatorio(ator, tipo, p);
    const relatorio = relatorioParaPdf(tipo, dados as never, { incluirPrevistos: tipo === "geral" && p.incluirPrevistos });
    const igreja = await igrejaParaPdf();
    const pdf = await renderizarPdf(createElement(Relatorio, { igreja, relatorio, geradoPor: ator.nome, geradoEm: geradoEm(new Date()) }));
    await registrarRelatorioGerado(ator, tipo, "pdf");
    return respostaArquivo(pdf, "application/pdf", nomeArquivoRelatorio(tipo, p.de, p.ate, "pdf"));
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
