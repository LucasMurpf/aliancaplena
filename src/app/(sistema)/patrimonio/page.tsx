import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { listarBens } from "@/lib/services/patrimonio";

export default function PaginaPatrimonio() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista />
    </Suspense>
  );
}

async function Lista() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "patrimonio.ver")) redirect("/em-breve");

  const { itens, valorTotal } = await listarBens(usuario);
  const podeGerenciar = pode(usuario.papeis, "patrimonio.gerenciar");

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Patrimônio</h1>
          <p className="text-sm text-slate-600 tabular-nums">
            {itens.length} {itens.length === 1 ? "bem" : "bens"} · {formatarBRL(valorTotal)}
          </p>
        </div>
        {podeGerenciar ? (
          <Link href="/patrimonio/novo" className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
            Novo bem
          </Link>
        ) : null}
      </header>

      {itens.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhum bem cadastrado</p>
          <p className="mt-1 text-sm text-slate-600">{podeGerenciar ? "Toque em Novo bem para começar." : "Ainda não há bens cadastrados."}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {itens.map((b) => (
              <li key={b.id}>
                <Link href={`/patrimonio/${b.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <span className="min-w-0">
                    <span className="block break-words font-semibold text-slate-900">{b.descricao}</span>
                    <span className="mt-0.5 block break-words text-xs text-slate-600">{b.local}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatarBRL(b.valor)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Descrição</th>
                  <th className="px-4 py-3 font-semibold">Local</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((b) => (
                  <tr key={b.id} className="hover:bg-marca-50/50">
                    <td className="px-4 py-3">
                      <Link href={`/patrimonio/${b.id}`} className="font-semibold text-marca-700 hover:underline">
                        {b.descricao}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.local}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatarBRL(b.valor)}</td>
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
