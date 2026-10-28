// GET /api/pdf/prestacao/:token — PDF público da prestação de contas (só estado 'ok').
// Somente leitura: não soma visualizações (isso é da página pública).
import { createElement } from "react";
import { Prestacao } from "@/lib/pdf/Prestacao";
import { carregarLogo } from "@/lib/pdf/logo";
import { renderizarPdf } from "@/lib/pdf/renderizar";
import { respostaArquivo, respostaDeErro, respostaTexto } from "@/lib/rotas/download";
import { lerPrestacaoPublica } from "@/lib/services/prestacao";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await ctx.params;
    const p = await lerPrestacaoPublica(token);
    if (p.estado !== "ok" || !p.snapshot || p.versao === undefined || !p.publicadaEm) {
      return respostaTexto(404, "Prestação de contas não encontrada.");
    }
    const logo = await carregarLogo(p.snapshot.igreja.logoUrl);
    const pdf = await renderizarPdf(createElement(Prestacao, { snapshot: p.snapshot, versao: p.versao, publicadaEm: p.publicadaEm, logo }));
    const mes = String(p.snapshot.mes).padStart(2, "0");
    return respostaArquivo(pdf, "application/pdf", `prestacao-${p.snapshot.ano}-${mes}-v${p.versao}.pdf`);
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
