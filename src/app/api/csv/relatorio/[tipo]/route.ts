// GET /api/csv/relatorio/:tipo?de&ate&contaId&categoriaId&incluirPrevistos=1&membroId — relatório em CSV (Excel BR).
import { obterUsuarioAtual, type UsuarioAtual } from "@/lib/auth";
import { nomeArquivoRelatorio, type TipoRelatorio } from "@/lib/pdf/dados";
import { registrarRelatorioGerado, respostaArquivo, respostaDeErro, respostaTexto, semSessao } from "@/lib/rotas/download";
import { buscarRelatorio, ehTipoRelatorio, lerParametros, type ParametrosRelatorio } from "@/lib/rotas/relatorio";
import { csvDe } from "@/lib/services/relatorios";

async function csvPara(ator: UsuarioAtual, tipo: TipoRelatorio, p: ParametrosRelatorio): Promise<string> {
  switch (tipo) {
    case "geral":
      return csvDe("geral", await buscarRelatorio(ator, "geral", p));
    case "arrecadacao":
      return csvDe("arrecadacao", await buscarRelatorio(ator, "arrecadacao", p));
    case "despesas":
      return csvDe("despesas", await buscarRelatorio(ator, "despesas", p));
    case "contribuicoes":
      return csvDe("contribuicoes", await buscarRelatorio(ator, "contribuicoes", p));
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ tipo: string }> }): Promise<Response> {
  try {
    const ator = await obterUsuarioAtual();
    if (!ator) return semSessao();
    const { tipo } = await ctx.params;
    if (!ehTipoRelatorio(tipo)) return respostaTexto(404, "Relatório não encontrado.");
    const p = lerParametros(request.url);
    // O CSV não leva avisos: a coluna Situação já marca os previstos.
    const csv = await csvPara(ator, tipo, p);
    await registrarRelatorioGerado(ator, tipo, "csv");
    return respostaArquivo(csv, "text/csv; charset=utf-8", nomeArquivoRelatorio(tipo, p.de, p.ate, "csv"));
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
