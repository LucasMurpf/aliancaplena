import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AbaHistorico } from "@/components/AbaHistorico";
import { descricaoDiferenca, formatarDataHora, ROTULO_MODO } from "@/components/calculadora/formatacao";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { obterContagem } from "@/lib/services/contagens";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaContagem(props: Props) {
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

  const c = await obterContagem(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";
  const dif = descricaoDiferenca(c.diferenca);

  // Ajuste: sobra vira entrada, falta vira saída; a data é a do culto (ou do dia da conferência do caixa).
  const dataBR = c.data ?? formatarDataBR(c.criadoEm);
  const [dd, mm, aaaa] = dataBR.split("/");
  const ajuste = new URLSearchParams({
    tipo: c.diferenca.isPositive() ? "ENTRADA" : "SAIDA",
    conta: c.contaId,
    data: `${aaaa}-${mm}-${dd}`,
    valor: formatarBRL(c.diferenca.abs()).replace("R$ ", ""),
    descricao: `Ajuste da contagem de ${dataBR}`,
  });
  const comItens = c.itens.filter((i) => i.quantidade > 0);

  const aba = (ativa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${ativa ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/calculadora" aria-label="Voltar para contagens" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Contagem</h1>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Contagem registrada</Alerta> : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="Resultado da contagem">
        <p className="text-sm text-slate-600">Conferência de {c.modo === "CULTO" ? "culto" : "caixa"}</p>
        <p className={`text-3xl font-bold ${dif.classe}`}>{dif.texto}</p>
        <dl className="mt-3 divide-y divide-slate-100">
          <Linha rotulo="Contado">{formatarBRL(c.totalContado)}</Linha>
          <Linha rotulo="Esperado">{formatarBRL(c.esperado)}</Linha>
          <Linha rotulo="Conta">{c.conta}</Linha>
          <Linha rotulo={c.modo === "CULTO" ? "Data do culto" : "Conferido em"}>{c.data ?? formatarDataHora(c.criadoEm)}</Linha>
          <Linha rotulo="Contado por">{c.criadoPor}</Linha>
          <Linha rotulo="Registrado em">{formatarDataHora(c.criadoEm)}</Linha>
          {c.observacao ? <Linha rotulo="Observação">{c.observacao}</Linha> : null}
        </dl>
        {!c.diferenca.isZero() && podeLancar ? (
          <div className="mt-4">
            <Link
              href={`/lancamentos/novo?${ajuste}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700"
            >
              Lançar ajuste
            </Link>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="titulo-qtd">
        <h2 id="titulo-qtd" className="text-base font-semibold text-slate-900">
          Quantidades
        </h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {comItens.map((i) => (
            <li key={i.denominacaoCentavos} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold tabular-nums text-slate-800">
                {i.rotulo} <span className="font-normal text-slate-600">({i.tipo === "cedula" ? "cédula" : "moeda"})</span>
              </span>
              <span className="tabular-nums text-slate-700">
                {i.quantidade} un. · <span className="font-semibold text-slate-900">{formatarBRL(i.subtotal)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {podeHistorico ? (
        <section aria-label="Histórico">
          <nav aria-label="Seções" className="mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <Link replace scroll={false} href={`/calculadora/${c.id}`} aria-current={historico ? undefined : "page"} className={aba(!historico)}>
              Resumo
            </Link>
            <Link replace scroll={false} href={`/calculadora/${c.id}?aba=historico`} aria-current={historico ? "page" : undefined} className={aba(historico)}>
              Histórico
            </Link>
          </nav>
          {historico ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
                <AbaHistorico entidade="Contagem" entidadeId={c.id} />
              </Suspense>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
