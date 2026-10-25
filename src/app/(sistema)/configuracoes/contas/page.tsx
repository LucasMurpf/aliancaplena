import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { ROTULO_TIPO_CONTA } from "@/lib/rotulos";
import { listarContas } from "@/lib/services/cadastros";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaContas({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista searchParams={searchParams} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Lista({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "cadastros.gerenciar")) redirect("/em-breve");

  const sp = await searchParams;
  const inativos = um(sp.inativos) === "1";
  const contas = await listarContas(usuario, { incluirInativas: inativos });

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Contas</h1>
          <p className="text-sm text-slate-600">Caixas e bancos da igreja.</p>
        </div>
        <Link href="/configuracoes/contas/novo" className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
          Nova conta
        </Link>
      </header>

      <p>
        <Link href={inativos ? "/configuracoes/contas" : "/configuracoes/contas?inativos=1"} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca-700 hover:underline">
          {inativos ? "Ocultar inativas" : "Mostrar inativas"}
        </Link>
      </p>

      {contas.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhuma conta cadastrada</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {contas.map((c) => (
              <li key={c.id}>
                <Link href={`/configuracoes/contas/${c.id}`} className={`flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${c.ativa ? "" : "bg-slate-50"}`}>
                  <span className="min-w-0">
                    <span className={`block truncate font-semibold ${c.ativa ? "text-slate-900" : "text-slate-500"}`}>{c.nome}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {ROTULO_TIPO_CONTA[c.tipo]} · saldo inicial {formatarBRL(c.saldoInicial)}
                    </span>
                  </span>
                  {c.ativa ? null : <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inativa</span>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold">Saldo inicial</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contas.map((c) => (
                  <tr key={c.id} className={`hover:bg-marca-50/50 ${c.ativa ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="px-4 py-3">
                      <Link href={`/configuracoes/contas/${c.id}`} className={`font-semibold hover:underline ${c.ativa ? "text-marca-700" : "text-slate-500"}`}>
                        {c.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ROTULO_TIPO_CONTA[c.tipo]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatarBRL(c.saldoInicial)}</td>
                    <td className="px-4 py-3">{c.ativa ? "Ativa" : "Inativa"}</td>
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
