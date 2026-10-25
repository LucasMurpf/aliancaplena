import Link from "next/link";

export type AlertaView = {
  id: string;
  descricao: string;
  categoria: string;
  valor: string;
  vencimento: string;
  tipoRotulo: string;
};

function Grupo({ titulo, itens, cor }: { titulo: string; itens: AlertaView[]; cor: "vencido" | "proximo" }) {
  if (itens.length === 0) return null;
  const estilo =
    cor === "vencido"
      ? "border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
      : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">
        {titulo} ({itens.length})
      </h3>
      <ul className="space-y-2">
        {itens.map((a) => (
          <li key={a.id}>
            <Link
              href={`/lancamentos/${a.id}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 ${estilo}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.descricao}</span>
                <span className="block text-xs">
                  {a.tipoRotulo}, {a.categoria}, vence em {a.vencimento}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{a.valor}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ListaAlertas({ vencidos, proximos }: { vencidos: AlertaView[]; proximos: AlertaView[] }) {
  return (
    <section aria-labelledby="titulo-alertas" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 id="titulo-alertas" className="mb-3 text-base font-semibold text-slate-900">
        Contas a pagar e a receber
      </h2>
      <div className="space-y-4">
        <Grupo titulo="Vencidas" itens={vencidos} cor="vencido" />
        {proximos.length > 0 ? (
          <Grupo titulo="Vencem nos próximos 7 dias" itens={proximos} cor="proximo" />
        ) : (
          <p className="text-sm text-slate-600">Nenhuma conta para os próximos 7 dias</p>
        )}
      </div>
    </section>
  );
}
