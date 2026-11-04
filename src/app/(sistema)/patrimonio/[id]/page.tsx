import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AbasDetalhe } from "@/components/AbasDetalhe";
import { FormBem } from "@/components/FormBem";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { obterBem } from "@/lib/services/patrimonio";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaBem(props: Props) {
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
  if (!pode(usuario.papeis, "patrimonio.ver")) redirect("/em-breve");
  const { id } = await params;
  const sp = await searchParams;

  const b = await obterBem(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/patrimonio" aria-label="Voltar para o patrimônio" className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-bold text-marca-900">{b.descricao}</h1>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Bem cadastrado</Alerta> : null}

      <AbasDetalhe base={`/patrimonio/${b.id}`} historico={historico} podeHistorico={podeHistorico} />

      {historico ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
            <AbaHistorico entidade="Bem" entidadeId={b.id} />
          </Suspense>
        </div>
      ) : pode(usuario.papeis, "patrimonio.gerenciar") ? (
        <FormBem id={b.id} inicial={{ descricao: b.descricao, valor: b.valor.toFixed(2).replace(".", ","), local: b.local }} />
      ) : (
        <dl className="divide-y divide-slate-100 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-slate-600">Valor</dt>
            <dd className="font-medium tabular-nums text-slate-900">{formatarBRL(b.valor)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-slate-600">Local</dt>
            <dd className="min-w-0 break-words text-right font-medium text-slate-900">{b.local}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
