import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR, hojeSP, parseDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { listarTransferencias } from "@/lib/services/transferencias";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaTransferencias({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista searchParams={searchParams} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
function dataOk(v: string | undefined): string | undefined {
  try {
    if (v) parseDataBR(v);
    return v;
  } catch {
    return undefined;
  }
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CAMPO = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900";

async function Lista({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");

  const sp = await searchParams;
  const hoje = hojeSP();
  const padraoDe = iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)));
  const padraoAte = iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)));
  const de = dataOk(um(sp.de)) ?? padraoDe;
  const ate = dataOk(um(sp.ate)) ?? padraoAte;
  const incluirCanceladas = um(sp.canceladas) === "1";

  const itens = await listarTransferencias(usuario, { de, ate, incluirCanceladas });
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/lancamentos" aria-label="Voltar para lançamentos" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
            <span aria-hidden="true">‹</span>
          </Link>
          <h1 className="text-2xl font-bold text-marca-900">Transferências</h1>
        </div>
        {podeLancar ? (
          <Link href="/lancamentos/novo?aba=transferencia" className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
            Nova
          </Link>
        ) : null}
      </header>

      <form method="get" className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="t-de" className="text-sm font-medium text-slate-800">De</label>
          <input id="t-de" name="de" type="date" defaultValue={de} className={CAMPO} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="t-ate" className="text-sm font-medium text-slate-800">Até</label>
          <input id="t-ate" name="ate" type="date" defaultValue={ate} className={CAMPO} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" name="canceladas" value="1" defaultChecked={incluirCanceladas} className="size-5" />
          Incluir canceladas
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
          Filtrar
        </button>
      </form>

      {itens.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhuma transferência no período</p>
          <p className="mt-1 text-sm text-slate-600">Mude as datas ou inclua as canceladas.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {itens.map((t) => (
              <li key={t.id}>
                <Link href={`/transferencias/${t.id}`} className="flex items-start justify-between gap-3 rounded-xl border-l-4 border-marca-600 bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">
                      {t.contaOrigem.nome} → {t.contaDestino.nome}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="tabular-nums">{formatarDataBR(t.data)}</span>
                      {t.status === "CANCELADA" ? <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">Cancelada</span> : null}
                    </span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${t.status === "CANCELADA" ? "text-slate-500 line-through" : "text-slate-900"}`}>{formatarBRL(t.valor)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">De</th>
                  <th className="px-4 py-3 font-semibold">Para</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((t) => (
                  <tr key={t.id} className="hover:bg-marca-50/50">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <Link href={`/transferencias/${t.id}`} className="font-semibold text-marca-700 hover:underline">{formatarDataBR(t.data)}</Link>
                    </td>
                    <td className="px-4 py-3">{t.contaOrigem.nome}</td>
                    <td className="px-4 py-3">{t.contaDestino.nome}</td>
                    <td className="px-4 py-3">{t.status === "CANCELADA" ? "Cancelada" : "Ativa"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${t.status === "CANCELADA" ? "text-slate-500 line-through" : ""}`}>{formatarBRL(t.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
