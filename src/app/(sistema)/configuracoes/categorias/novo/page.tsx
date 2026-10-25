import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormCategoria } from "@/components/FormCategoria";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";

export default function PaginaNovaCategoria() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Nova />
    </Suspense>
  );
}

async function Nova() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "cadastros.gerenciar")) redirect("/em-breve");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/configuracoes/categorias" aria-label="Voltar para categorias" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Nova categoria</h1>
      </header>
      <FormCategoria />
    </div>
  );
}
