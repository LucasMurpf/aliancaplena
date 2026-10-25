import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormMembro } from "@/components/FormMembro";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";

export default function PaginaNovoMembro() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Novo />
    </Suspense>
  );
}

async function Novo() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "membros.ver_nomes")) redirect("/em-breve");
  if (!pode(usuario.papeis, "membros.gerenciar")) redirect("/membros");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/membros" aria-label="Voltar para membros" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Novo membro</h1>
      </header>
      <FormMembro />
    </div>
  );
}
