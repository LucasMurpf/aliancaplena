import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormBem } from "@/components/FormBem";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";

export default function PaginaNovoBem() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Novo />
    </Suspense>
  );
}

async function Novo() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "patrimonio.gerenciar")) redirect("/patrimonio");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/patrimonio" aria-label="Voltar para o patrimônio" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Novo bem</h1>
      </header>
      <FormBem />
    </div>
  );
}
