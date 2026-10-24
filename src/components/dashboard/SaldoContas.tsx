export type ContaSaldo = { id: string; nome: string; tipo: string; saldo: string; negativo: boolean };

/** Saldo atual por conta. Valores já formatados no servidor. */
export function SaldoContas({ contas }: { contas: ContaSaldo[] }) {
  if (contas.length === 0) return <p className="mt-3 text-sm text-slate-600">Nenhuma conta cadastrada</p>;
  return (
    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
      {contas.map((c) => (
        <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-800">{c.nome}</span>
            <span className="block text-xs text-slate-600">{c.tipo}</span>
          </span>
          <span className={`shrink-0 tabular-nums ${c.negativo ? "text-red-700" : "text-slate-900"}`}>{c.saldo}</span>
        </li>
      ))}
    </ul>
  );
}
