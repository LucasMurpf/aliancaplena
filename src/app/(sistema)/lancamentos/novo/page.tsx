import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormLancamento } from "@/components/FormLancamento";
import { FormTransferencia } from "@/components/FormTransferencia";
import { Alerta } from "@/components/ui/Alerta";
import { obterUsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { lerPrefillLancamento } from "@/lib/prefill-lancamento";
import { listarCategorias, listarContas } from "@/lib/services/cadastros";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaNovoLancamento({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Novo searchParams={searchParams} />
    </Suspense>
  );
}

async function Novo({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  if (!pode(usuario.papeis, "financeiro.lancar")) redirect("/lancamentos");

  const sp = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const transferencia = um(sp.aba) === "transferencia";
  const viaAtalho = um(sp.origem) === "atalho";
  const [contas, categorias] = await Promise.all([listarContas(usuario), listarCategorias(usuario)]);
  const hoje = hojeSP().toISOString().slice(0, 10);
  const inicial = transferencia ? undefined : lerPrefillLancamento(sp, { contas, hoje });

  const aba = (ativa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${
      ativa ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"
    }`;
  const sufixo = viaAtalho ? "&origem=atalho" : "";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-marca-900">{transferencia ? "Nova transferência" : "Novo lançamento"}</h1>
      <nav aria-label="Tipo de registro" className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        <Link href={`/lancamentos/novo${viaAtalho ? "?origem=atalho" : ""}`} aria-current={transferencia ? undefined : "page"} className={aba(!transferencia)}>
          Lançamento
        </Link>
        <Link href={`/lancamentos/novo?aba=transferencia${sufixo}`} aria-current={transferencia ? "page" : undefined} className={aba(transferencia)}>
          Transferência
        </Link>
      </nav>
      {contas.length === 0 ? (
        <Alerta tipo="info">Cadastre uma conta antes de lançar.</Alerta>
      ) : transferencia ? (
        <FormTransferencia contas={contas.map((c) => ({ id: c.id, nome: c.nome }))} hoje={hoje} />
      ) : (
        <FormLancamento
          contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, nominal: c.nominal }))}
          hoje={hoje}
          viaAtalho={viaAtalho}
          inicial={inicial}
        />
      )}
    </div>
  );
}
