import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { ITENS_POR_PAGINA_MEMBROS, listarMembros } from "@/lib/services/cadastros";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaMembros({ searchParams }: Props) {
  // Sessão e dados são lidos em requisição: ficam atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista searchParams={searchParams} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function hrefLista(p: { busca?: string; pagina?: number; inativos: boolean }): string {
  const q = new URLSearchParams();
  if (p.busca) q.set("busca", p.busca);
  if (p.inativos) q.set("inativos", "1");
  if (p.pagina && p.pagina > 1) q.set("pagina", String(p.pagina));
  const s = q.toString();
  return s ? `/membros?${s}` : "/membros";
}

const BOTAO_SECUNDARIO =
  "inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-slate-300 hover:bg-slate-50";

async function Lista({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "membros.ver_nomes")) redirect("/em-breve");

  const sp = await searchParams;
  const busca = um(sp.busca)?.trim() || undefined;
  const inativos = um(sp.inativos) === "1";
  const pagina = Math.max(1, Number(um(sp.pagina)) || 1);
  const { itens, total } = await listarMembros(usuario, { busca, incluirInativos: inativos, pagina });
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA_MEMBROS));
  const podeGerenciar = pode(usuario.papeis, "membros.gerenciar");

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Membros</h1>
          <p className="text-sm text-slate-600">
            {total} {total === 1 ? "membro" : "membros"}
            {busca ? " encontrados" : ""}
          </p>
        </div>
        {podeGerenciar ? (
          <Link href="/membros/novo" className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
            Novo membro
          </Link>
        ) : null}
      </header>

      <form method="get" action="/membros" className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-end">
        {inativos ? <input type="hidden" name="inativos" value="1" /> : null}
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="m-busca" className="text-sm font-medium text-slate-800">
            Buscar pelo nome
          </label>
          <input id="m-busca" name="busca" type="search" defaultValue={busca ?? ""} autoComplete="off" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900" />
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
          Buscar
        </button>
      </form>

      <p>
        <Link href={hrefLista({ busca, inativos: !inativos })} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca-700 hover:underline">
          {inativos ? "Ocultar inativos" : "Mostrar inativos"}
        </Link>
      </p>

      {itens.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhum membro encontrado</p>
          <p className="mt-1 text-sm text-slate-600">{busca ? "Tente outro nome." : "Cadastre o primeiro membro."}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {itens.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/membros/${m.id}`}
                  className={`flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${m.ativo ? "" : "bg-slate-50"}`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate font-semibold ${m.ativo ? "text-slate-900" : "text-slate-500"}`}>{m.nome}</span>
                    <span className="block truncate text-sm text-slate-600">{m.telefone ?? "Sem telefone"}</span>
                  </span>
                  {m.ativo ? null : <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inativo</span>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((m) => (
                  <tr key={m.id} className={`hover:bg-marca-50/50 ${m.ativo ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="px-4 py-3">
                      <Link href={`/membros/${m.id}`} className={`font-semibold hover:underline ${m.ativo ? "text-marca-700" : "text-slate-500"}`}>
                        {m.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{m.telefone ?? "—"}</td>
                    <td className="px-4 py-3">{m.ativo ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPaginas > 1 ? (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-2">
          {pagina > 1 ? (
            <Link href={hrefLista({ busca, inativos, pagina: pagina - 1 })} className={BOTAO_SECUNDARIO}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-slate-700">
            Página {pagina} de {totalPaginas}
          </p>
          {pagina < totalPaginas ? (
            <Link href={hrefLista({ busca, inativos, pagina: pagina + 1 })} className={BOTAO_SECUNDARIO}>
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
