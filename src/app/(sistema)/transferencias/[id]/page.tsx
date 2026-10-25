import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AcoesTransferencia } from "@/components/AcoesLancamento";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { obterTransferencia } from "@/lib/services/transferencias";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaTransferencia(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-slate-600">{rotulo}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

async function Detalhe({ params, searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  const { id } = await params;
  const sp = await searchParams;

  const t = await obterTransferencia(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const ativa = t.status === "ATIVA";
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";
  const aba = (a: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${a ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/transferencias" aria-label="Voltar para transferências" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Transferência</h1>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Transferência salva</Alerta> : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="Dados da transferência">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-3xl font-bold tabular-nums ${ativa ? "text-slate-900" : "text-slate-500 line-through"}`}>{formatarBRL(t.valor)}</p>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${ativa ? "bg-marca-100 text-marca-900" : "bg-slate-200 text-slate-700"}`}>
            {ativa ? "Ativa" : "Cancelada"}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Não conta como entrada nem saída: só move o dinheiro entre contas.</p>
        <dl className="mt-3 divide-y divide-slate-100">
          <Linha rotulo="Sai de">{t.contaOrigem.nome}</Linha>
          <Linha rotulo="Entra em">{t.contaDestino.nome}</Linha>
          <Linha rotulo="Data">{formatarDataBR(t.data)}</Linha>
          {t.descricao ? <Linha rotulo="Descrição">{t.descricao}</Linha> : null}
          {t.motivoCancelamento ? <Linha rotulo="Motivo do cancelamento">{t.motivoCancelamento}</Linha> : null}
        </dl>
      </section>

      <div>
        <AcoesTransferencia id={t.id} ativa={ativa} podeLancar={pode(usuario.papeis, "financeiro.lancar")} />
      </div>

      {podeHistorico ? (
        <section aria-label="Histórico">
          <nav aria-label="Seções" className="mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <Link replace scroll={false} href={`/transferencias/${t.id}`} aria-current={historico ? undefined : "page"} className={aba(!historico)}>
              Resumo
            </Link>
            <Link replace scroll={false} href={`/transferencias/${t.id}?aba=historico`} aria-current={historico ? "page" : undefined} className={aba(historico)}>
              Histórico
            </Link>
          </nav>
          {historico ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
                <AbaHistorico entidade="Transferencia" entidadeId={t.id} />
              </Suspense>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
