import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AcoesLancamento } from "@/components/AcoesLancamento";
import { AdicionarAnexos } from "@/components/AdicionarAnexos";
import { AnexoLink } from "@/components/AnexoLink";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { obterLancamento } from "@/lib/services/lancamentos";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[]; aviso?: string | string[] }>;
};

export default function PaginaLancamento(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function tamanho(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const SELO = {
  PREVISTO: "bg-amber-100 text-amber-900",
  REALIZADO: "bg-emerald-100 text-emerald-900",
  CANCELADO: "bg-slate-200 text-slate-700",
} as const;
const ROTULO_STATUS = { PREVISTO: "Previsto", REALIZADO: "Realizado", CANCELADO: "Cancelado" } as const;

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

  const l = await obterLancamento(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";
  const entrada = l.tipo === "ENTRADA";
  const hoje = hojeSP().toISOString().slice(0, 10);

  const aba = (ativa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${ativa ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/lancamentos" aria-label="Voltar para lançamentos" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Lançamento</h1>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Lançamento salvo</Alerta> : null}
      {um(sp.aviso) === "anexo" ? (
        <Alerta tipo="info">O lançamento foi salvo, mas algum comprovante não foi enviado. Anexe de novo abaixo.</Alerta>
      ) : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="Dados do lançamento">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">{entrada ? "Entrada" : "Saída"}</p>
            <p className={`text-3xl font-bold tabular-nums ${l.status === "CANCELADO" ? "text-slate-500 line-through" : entrada ? "text-emerald-700" : "text-red-700"}`}>
              {formatarBRL(l.valor)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${SELO[l.status]}`}>{ROTULO_STATUS[l.status]}</span>
        </div>
        <dl className="mt-3 divide-y divide-slate-100">
          <Linha rotulo="Categoria">{l.categoria.nome}</Linha>
          {l.membro ? <Linha rotulo="Membro">{l.membro.nome}</Linha> : null}
          <Linha rotulo="Conta">{l.conta.nome}</Linha>
          <Linha rotulo="Vencimento">{formatarDataBR(l.dataVencimento)}</Linha>
          {l.dataRealizacao ? <Linha rotulo="Realizado em">{formatarDataBR(l.dataRealizacao)}</Linha> : null}
          {l.descricao ? <Linha rotulo="Descrição">{l.descricao}</Linha> : null}
          {l.motivoCancelamento ? <Linha rotulo="Motivo do cancelamento">{l.motivoCancelamento}</Linha> : null}
        </dl>
      </section>

      <AcoesLancamento id={l.id} status={l.status} hoje={hoje} podeLancar={podeLancar} />

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="titulo-anexos">
        <h2 id="titulo-anexos" className="text-base font-semibold text-slate-900">
          Comprovantes
        </h2>
        {l.anexos.length === 0 ? <p className="mt-1 text-sm text-slate-600">Nenhum comprovante anexado.</p> : null}
        <ul className="mt-2 flex flex-col gap-1">
          {l.anexos.map((a) => (
            <AnexoLink key={a.id} id={a.id} nome={a.nomeArquivo} detalhe={`${a.mimeType === "application/pdf" ? "PDF" : "Imagem"} · ${tamanho(a.tamanho)}`} />
          ))}
        </ul>
        {podeLancar && l.status !== "CANCELADO" ? (
          <div className="mt-3">
            <AdicionarAnexos lancamentoId={l.id} />
          </div>
        ) : null}
      </section>

      {podeHistorico ? (
        <section aria-label="Histórico">
          <nav aria-label="Seções" className="mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <Link replace scroll={false} href={`/lancamentos/${l.id}`} aria-current={historico ? undefined : "page"} className={aba(!historico)}>
              Resumo
            </Link>
            <Link replace scroll={false} href={`/lancamentos/${l.id}?aba=historico`} aria-current={historico ? "page" : undefined} className={aba(historico)}>
              Histórico
            </Link>
          </nav>
          {historico ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
                <AbaHistorico entidade="Lancamento" entidadeId={l.id} />
              </Suspense>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
