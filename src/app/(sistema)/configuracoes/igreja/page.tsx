import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AbasDetalhe } from "@/components/AbasDetalhe";
import { FormIgreja } from "@/components/FormIgreja";
import { obterUsuarioAtual } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { obterConfiguracaoAdmin } from "@/lib/services/configuracao";

type Props = { searchParams: Promise<{ aba?: string | string[] }> };

export default function PaginaDadosIgreja(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Detalhe({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "admin")) redirect("/em-breve");
  const sp = await searchParams;

  const c = await obterConfiguracaoAdmin(usuario).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-marca-900">Dados da igreja</h1>
      </header>

      <AbasDetalhe base="/configuracoes/igreja" historico={historico} podeHistorico={podeHistorico} />

      {historico ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
            <AbaHistorico entidade="Configuracao" entidadeId={c.id} />
          </Suspense>
        </div>
      ) : (
        <FormIgreja inicial={{ nomeIgreja: c.nomeIgreja, logoUrl: c.logoUrl ?? "", cnpj: c.cnpj ?? "", metricasAtivas: c.metricasAtivas }} />
      )}
    </div>
  );
}
