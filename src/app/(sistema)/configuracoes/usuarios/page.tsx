import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Papel } from "@prisma/client";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { ROTULO_PAPEL } from "@/lib/rotulos";
import { listarUsuarios } from "@/lib/services/usuarios";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaUsuarios({ searchParams }: Props) {
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
  if (!pode(usuario.papeis, "admin")) redirect("/em-breve");

  const sp = await searchParams;
  const inativos = um(sp.inativos) === "1";
  const todos = await listarUsuarios(usuario);
  const usuarios = inativos ? todos : todos.filter((u) => u.ativo);
  const papeisDe = (u: { papeis: Papel[] }) => u.papeis.map((p) => ROTULO_PAPEL[p]).join(", ") || "Sem papel";

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Usuários</h1>
          <p className="text-sm text-slate-600">Quem entra no sistema e o que cada um pode fazer.</p>
        </div>
        <Link href="/configuracoes/usuarios/novo" className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
          Novo usuário
        </Link>
      </header>

      <p>
        <Link href={inativos ? "/configuracoes/usuarios" : "/configuracoes/usuarios?inativos=1"} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca-700 hover:underline">
          {inativos ? "Ocultar inativos" : "Mostrar inativos"}
        </Link>
      </p>

      <ul className="flex flex-col gap-2 md:hidden">
        {usuarios.map((u) => (
          <li key={u.id}>
            <Link href={`/configuracoes/usuarios/${u.id}`} className={`flex items-start justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${u.ativo ? "" : "bg-slate-50"}`}>
              <span className="min-w-0">
                <span className={`block truncate font-semibold ${u.ativo ? "text-slate-900" : "text-slate-500"}`}>{u.nome}</span>
                <span className="block truncate text-sm text-slate-600">{u.email}</span>
                <span className="mt-1 block text-xs text-slate-600">{papeisDe(u)}</span>
              </span>
              {u.ativo ? null : <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inativo</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">E-mail</th>
              <th className="px-4 py-3 font-semibold">Papéis</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.id} className={`hover:bg-marca-50/50 ${u.ativo ? "" : "bg-slate-50 text-slate-500"}`}>
                <td className="px-4 py-3">
                  <Link href={`/configuracoes/usuarios/${u.id}`} className={`font-semibold hover:underline ${u.ativo ? "text-marca-700" : "text-slate-500"}`}>
                    {u.nome}
                  </Link>
                </td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{papeisDe(u)}</td>
                <td className="px-4 py-3">{u.ativo ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
