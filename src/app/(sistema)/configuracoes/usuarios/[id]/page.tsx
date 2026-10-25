import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { definirUsuarioAtivoAction } from "@/app/(sistema)/configuracoes/usuarios/actions";
import { AbaHistorico } from "@/components/AbaHistorico";
import { AbasDetalhe } from "@/components/AbasDetalhe";
import { BotaoAtivo } from "@/components/BotaoAtivo";
import { BotaoRedefinirSenha } from "@/components/BotaoRedefinirSenha";
import { FormUsuario } from "@/components/FormUsuario";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { listarUsuarios } from "@/lib/services/usuarios";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; salvo?: string | string[] }>;
};

export default function PaginaUsuario(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Detalhe({ params, searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "admin")) redirect("/em-breve");
  const { id } = await params;
  const sp = await searchParams;

  const alvo = (await listarUsuarios(usuario)).find((u) => u.id === id);
  if (!alvo) notFound();
  const podeHistorico = pode(usuario.papeis, "historico.ver");
  const historico = podeHistorico && um(sp.aba) === "historico";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/configuracoes/usuarios" aria-label="Voltar para usuários" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-marca-900">{alvo.nome}</h1>
          {alvo.ativo ? null : <p className="text-sm font-semibold text-slate-600">Inativo</p>}
        </div>
      </header>

      {um(sp.salvo) ? <Alerta tipo="sucesso">Usuário cadastrado</Alerta> : null}

      <AbasDetalhe base={`/configuracoes/usuarios/${alvo.id}`} historico={historico} podeHistorico={podeHistorico} />

      {historico ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Suspense fallback={<p className="text-sm text-slate-600">Carregando histórico…</p>}>
            <AbaHistorico entidade="Usuario" entidadeId={alvo.id} />
          </Suspense>
        </div>
      ) : (
        <>
          <FormUsuario id={alvo.id} inicial={{ nome: alvo.nome, email: alvo.email, papeis: alvo.papeis }} />
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div>
              <p className="mb-3 text-sm text-slate-700">
                {alvo.ativo ? "Um usuário inativo não consegue entrar no sistema." : "Este usuário está inativo e não consegue entrar no sistema."}
              </p>
              <BotaoAtivo id={alvo.id} ativo={alvo.ativo} alternar={definirUsuarioAtivoAction} />
            </div>
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-3 text-sm text-slate-700">Defina uma nova senha para este usuário.</p>
              <BotaoRedefinirSenha id={alvo.id} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
