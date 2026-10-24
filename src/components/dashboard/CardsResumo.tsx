import { SaldoContas, type ContaSaldo } from "./SaldoContas";

type Props = {
  entradas: string;
  saidas: string;
  resultado: string;
  resultadoNegativo: boolean;
  saldoTotal: string;
  saldoNegativo: boolean;
  contas: ContaSaldo[];
};

const CARD = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200";
const ROTULO = "text-sm font-medium text-slate-700";
const VALOR = "mt-1 text-xl font-bold tabular-nums sm:text-2xl";

export function CardsResumo(p: Props) {
  return (
    <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4">
      <section className={CARD} aria-labelledby="card-entradas">
        <h2 id="card-entradas" className={ROTULO}>Entradas</h2>
        <p className={`${VALOR} text-emerald-700`}>{p.entradas}</p>
      </section>
      <section className={CARD} aria-labelledby="card-saidas">
        <h2 id="card-saidas" className={ROTULO}>Saídas</h2>
        <p className={`${VALOR} text-red-700`}>{p.saidas}</p>
      </section>
      <section className={CARD} aria-labelledby="card-resultado">
        <h2 id="card-resultado" className={ROTULO}>Resultado</h2>
        <p className={`${VALOR} ${p.resultadoNegativo ? "text-red-700" : "text-slate-900"}`}>{p.resultado}</p>
      </section>
      <details className={`${CARD} group col-span-2 lg:col-span-1 lg:self-start`}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 [&::-webkit-details-marker]:hidden">
          <span>
            <span className={`block ${ROTULO}`}>Saldo atual</span>
            <span className={`${VALOR} block ${p.saldoNegativo ? "text-red-700" : "text-slate-900"}`}>{p.saldoTotal}</span>
          </span>
          <span className="mt-1 text-xs text-slate-600">
            <span className="group-open:hidden">Ver contas</span>
            <span className="hidden group-open:inline">Ocultar</span>
          </span>
        </summary>
        <SaldoContas contas={p.contas} />
      </details>
    </div>
  );
}
