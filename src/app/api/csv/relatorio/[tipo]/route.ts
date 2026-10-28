// GET /api/csv/relatorio/:tipo?de&ate&contaId&categoriaId&incluirPrevistos=1&membroId — relatório em CSV (Excel BR).
import { obterUsuarioAtual } from "@/lib/auth";
import { AVISO_PREVISTOS, nomeArquivoRelatorio } from "@/lib/pdf/dados";
import { registrarRelatorioGerado, respostaArquivo, respostaDeErro, respostaTexto, semSessao } from "@/lib/rotas/download";
import { buscarRelatorio, ehTipoRelatorio, lerParametros } from "@/lib/rotas/relatorio";
import { csvDe } from "@/lib/services/relatorios";

const BOM = "﻿";

export async function GET(request: Request, ctx: { params: Promise<{ tipo: string }> }): Promise<Response> {
  try {
    const ator = await obterUsuarioAtual();
    if (!ator) return semSessao();
    const { tipo } = await ctx.params;
    if (!ehTipoRelatorio(tipo)) return respostaTexto(404, "Relatório não encontrado.");
    const p = lerParametros(request.url);
    const dados = await buscarRelatorio(ator, tipo, p);
    let csv = csvDe(tipo, dados as never);
    // Relatório geral com previstos: a primeira linha (logo após o BOM) avisa.
    if (tipo === "geral" && p.incluirPrevistos) csv = `${BOM}${AVISO_PREVISTOS}\r\n${csv.startsWith(BOM) ? csv.slice(1) : csv}`;
    await registrarRelatorioGerado(ator, tipo, "csv");
    return respostaArquivo(csv, "text/csv; charset=utf-8", nomeArquivoRelatorio(tipo, p.de, p.ate, "csv"));
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
