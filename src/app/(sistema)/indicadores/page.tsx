import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CartoesComparativos } from "@/components/indicadores/CartoesComparativos";
import { ContribuintesMes } from "@/components/indicadores/ContribuintesMes";
import { GraficoCategoriasMes } from "@/components/indicadores/GraficoCategoriasMes";
import { GraficoEntradasSaidas } from "@/components/indicadores/GraficoEntradasSaidas";
import { GraficoSaldo } from "@/components/indicadores/GraficoSaldo";
import { RastreioIndicadores } from "@/components/indicadores/RastreioIndicadores";
import { obterUsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { adaptarIndicadores, rotuloMesCartao } from "@/lib/indicadores-tela";
import { pode } from "@/lib/permissoes";
import { indicadores } from "@/lib/services/indicadores";

export default function PaginaIndicadores() {
  // Sessão e dados são lidos em requisição: ficam atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Corpo />
    </Suspense>
  );
}

async function Corpo() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");

  const tela = adaptarIndicadores(await indicadores(usuario));
  const atual = tela.meses[tela.meses.length - 1];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RastreioIndicadores />
      <header>
        <h1 className="text-2xl font-bold text-marca-900">Indicadores</h1>
        <p className="text-sm text-slate-600">Os últimos 12 meses e o mês atual, considerando só o que já foi realizado.</p>
      </header>

      {tela.vazio ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-base font-semibold text-slate-900">Ainda não há movimentações para mostrar</p>
          <p className="mt-1 text-sm text-slate-600">
            Assim que houver entradas ou saídas realizadas nos últimos 13 meses, os gráficos aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          <CartoesComparativos entradas={tela.comparativos.entradas} saidas={tela.comparativos.saidas} mes={rotuloMesCartao(atual, hojeSP())} />
          <GraficoEntradasSaidas meses={tela.meses} />
          <GraficoSaldo meses={tela.meses} />
          <GraficoCategoriasMes meses={tela.meses} categorias={tela.categorias} />
          <ContribuintesMes meses={tela.meses} />
        </>
      )}
    </div>
  );
}
