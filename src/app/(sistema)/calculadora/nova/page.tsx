import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FormContagem } from "@/components/calculadora/FormContagem";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { listarContas } from "@/lib/services/cadastros";

export default function PaginaNovaContagem() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Nova />
    </Suspense>
  );
}

async function Nova() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  if (!pode(usuario.papeis, "financeiro.lancar")) redirect("/calculadora");

  const contas = await listarContas(usuario);
  const hoje = hojeSP().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-2">
        <Link href="/calculadora" aria-label="Voltar para contagens" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="text-2xl font-bold text-marca-900">Nova contagem</h1>
      </header>
      {contas.length === 0 ? (
        <Alerta tipo="info">Cadastre uma conta antes de contar.</Alerta>
      ) : (
        <FormContagem contas={contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo }))} hoje={hoje} />
      )}
    </div>
  );
}
