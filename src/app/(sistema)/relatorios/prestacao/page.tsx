import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AbasRelatorios } from "@/components/relatorios/AbasRelatorios";
import { ListaPrestacoes, type ItemPrestacao } from "@/components/prestacao/ListaPrestacoes";
import { NovaPrestacao } from "@/components/prestacao/NovaPrestacao";
import { obterUsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { lerFiltrosRelatorio } from "@/lib/filtros-relatorio";
import { pode } from "@/lib/permissoes";
import { rotuloMesExtenso } from "@/lib/prestacao/ui";
import { dataSP, listarPrestacoes } from "@/lib/services/prestacao";

export default function PaginaPrestacoes() {
  // Sessão e dados são lidos em requisição: ficam atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista />
    </Suspense>
  );
}

async function Lista() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");

  const hoje = hojeSP();
  const iso = hoje.toISOString().slice(0, 10);
  const itens: ItemPrestacao[] = (await listarPrestacoes(usuario)).map((p) => ({
    id: p.id,
    token: p.token,
    mes: rotuloMesExtenso(p.ano, p.mes),
    versao: p.versao,
    publicadaPor: p.publicadaPor,
    publicadaEm: dataSP(p.publicadaEm),
    visualizacoes: p.visualizacoes,
    retirada: p.despublicada,
    retiradaEm: p.despublicadaEm ? dataSP(p.despublicadaEm) : null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-8">
      <header>
        <h1 className="text-2xl font-bold text-marca-900">Relatórios</h1>
        <p className="text-sm text-slate-600">Prestação de contas</p>
      </header>
      <AbasRelatorios ativa="prestacao" filtros={lerFiltrosRelatorio({}, "geral", hoje)} comContribuicoes={pode(usuario.papeis, "membros.ver_nomes")} />
      <p className="text-base text-slate-700">
        Publique a foto de um mês para os membros acompanharem as contas da igreja. O link mostra exatamente a versão publicada; nomes de membros nunca aparecem.
      </p>
      {podeLancar ? <NovaPrestacao hoje={iso} mesAtual={iso.slice(0, 7)} /> : null}
      <ListaPrestacoes itens={itens} podeRetirar={podeLancar} />
    </div>
  );
}
