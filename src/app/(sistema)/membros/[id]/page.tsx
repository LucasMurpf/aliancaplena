import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AbasDetalhe } from "@/components/AbasDetalhe";
import { BotaoAtivo } from "@/components/BotaoAtivo";
import { FormMembro } from "@/components/FormMembro";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR } from "@/lib/datas";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { definirMembroAtivoAction } from "@/app/(sistema)/membros/actions";
import { obterMembro } from "@/lib/services/cadastros";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaMembro(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const iso = (d: Date) => d.toISOString().slice(0, 10);

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
  if (!pode(usuario.papeis, "membros.ver_nomes")) redirect("/em-breve");
  const { id } = await params;
  const sp = await searchParams;

  const m = await obterMembro(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const podeGerenciar = pode(usuario.papeis, "membros.gerenciar");
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/membros" aria-label="Voltar para membros" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-marca-900">{m.nome}</h1>
          {m.ativo ? null : <p className="text-sm font-semibold text-slate-600">Inativo</p>}
        </div>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Membro cadastrado</Alerta> : null}

      <AbasDetalhe base={`/membros/${m.id}`} historico={historico} podeHistorico={podeHistorico} />

      {historico ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
            <AbaHistorico entidade="Membro" entidadeId={m.id} />
          </Suspense>
        </div>
      ) : podeGerenciar ? (
        <>
          <FormMembro
            id={m.id}
            inicial={{
              nome: m.nome,
              telefone: m.telefone ?? "",
              dataNascimento: m.dataNascimento ? iso(m.dataNascimento) : "",
            }}
          />
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="mb-3 text-sm text-slate-700">
              {m.ativo ? "Inativar tira o membro das listas de novos lançamentos. Ele continua no histórico." : "Este membro está inativo e não aparece em novos lançamentos."}
            </p>
            <BotaoAtivo id={m.id} ativo={m.ativo} alternar={definirMembroAtivoAction} />
          </div>
        </>
      ) : (
        <dl className="divide-y divide-slate-100 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Linha rotulo="Telefone">{m.telefone ?? "—"}</Linha>
          <Linha rotulo="Nascimento">{m.dataNascimento ? formatarDataBR(m.dataNascimento) : "—"}</Linha>
        </dl>
      )}
    </div>
  );
}
