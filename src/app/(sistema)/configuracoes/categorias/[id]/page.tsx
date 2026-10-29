import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { definirCategoriaAtivaAction } from "@/app/(sistema)/configuracoes/categorias/actions";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AbasDetalhe } from "@/components/AbasDetalhe";
import { BotaoAtivo } from "@/components/BotaoAtivo";
import { FormCategoria } from "@/components/FormCategoria";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { listarCategorias } from "@/lib/services/cadastros";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaCategoria(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Detalhe({ params, searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "cadastros.gerenciar")) redirect("/em-breve");
  const { id } = await params;
  const sp = await searchParams;

  const c = (await listarCategorias(usuario, { incluirInativas: true })).find((x) => x.id === id);
  if (!c) notFound();
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/configuracoes/categorias" aria-label="Voltar para categorias" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-marca-900">{c.nome}</h1>
          {c.ativa ? null : <p className="text-sm font-semibold text-slate-600">Inativa</p>}
        </div>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Categoria cadastrada</Alerta> : null}

      <AbasDetalhe base={`/configuracoes/categorias/${c.id}`} historico={historico} podeHistorico={podeHistorico} />

      {historico ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
            <AbaHistorico entidade="Categoria" entidadeId={c.id} />
          </Suspense>
        </div>
      ) : (
        <>
          <FormCategoria id={c.id} inicial={{ nome: c.nome, tipo: c.tipo, nominal: c.nominal, detalharPublico: c.detalharPublico }} />
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="mb-3 text-sm text-slate-700">
              {c.ativa ? "Uma categoria inativa não aparece nos novos lançamentos. O histórico continua." : "Esta categoria está inativa e não aparece nos novos lançamentos."}
            </p>
            <BotaoAtivo id={c.id} ativo={c.ativa} alternar={definirCategoriaAtivaAction} />
          </div>
        </>
      )}
    </div>
  );
}
