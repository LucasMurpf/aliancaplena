import type { CartaoTela, Direcao } from "@/lib/indicadores-tela";

const SETA: Record<Direcao, string> = { alta: "▲", queda: "▼", estavel: "▬", nenhuma: "" };

function Linha({ rotulo, texto, variacao }: { rotulo: string; texto: string; variacao: CartaoTela["anoAnterior"]["variacao"] }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 py-2 first:border-t-0">
      <dt className="text-sm text-slate-600">
        {rotulo}
        <span className="block tabular-nums text-slate-800">{texto}</span>
      </dt>
      <dd className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
        <span aria-hidden="true">{SETA[variacao.direcao]} {variacao.texto}</span>
        <span className="sr-only">{variacao.leitura}</span>
      </dd>
    </div>
  );
}

function Cartao({ id, titulo, dados, mes }: { id: string; titulo: string; dados: CartaoTela; mes: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h3 id={id} className="text-sm font-semibold text-slate-600">{titulo}</h3>
      <p className="text-2xl font-bold tabular-nums text-slate-900">{dados.atual}</p>
      <p className="mb-2 text-xs text-slate-500 first-letter:uppercase">{mes}</p>
      <dl>
        <Linha rotulo="Mesmo mês do ano anterior" texto={dados.anoAnterior.texto} variacao={dados.anoAnterior.variacao} />
        <Linha rotulo="Média dos 12 meses anteriores" texto={dados.media12.texto} variacao={dados.media12.variacao} />
      </dl>
    </section>
  );
}

export function CartoesComparativos({ entradas, saidas, mes }: { entradas: CartaoTela; saidas: CartaoTela; mes: string }) {
  return (
    <section aria-labelledby="ind-comparativos" className="space-y-2">
      <div>
        <h2 id="ind-comparativos" className="text-base font-semibold text-slate-900">Este mês em comparação</h2>
        <p className="text-sm text-slate-600">
          O mês atual contra o mesmo mês do ano passado e contra a média dos 12 meses anteriores. A seta mostra se subiu ou desceu; “—” quando não há base para comparar.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Cartao id="ind-comp-entradas" titulo="Entradas" dados={entradas} mes={mes} />
        <Cartao id="ind-comp-saidas" titulo="Saídas" dados={saidas} mes={mes} />
      </div>
    </section>
  );
}
