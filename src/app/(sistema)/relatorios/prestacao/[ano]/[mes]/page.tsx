import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alerta } from "@/components/ui/Alerta";
import { PublicarPrestacao } from "@/components/prestacao/PublicarPrestacao";
import { VisaoPrestacao } from "@/components/prestacao/VisaoPrestacao";
import { obterUsuarioAtual } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { pode } from "@/lib/permissoes";
import { rotuloMesExtenso } from "@/lib/prestacao/ui";
import { previaPrestacao, type SnapshotPrestacao } from "@/lib/services/prestacao";

type Props = { params: Promise<{ ano: string; mes: string }> };

export default function PaginaPreviaPrestacao(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl" aria-busy="true" />}>
      <Previa {...props} />
    </Suspense>
  );
}

async function Previa({ params }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  const { ano: a, mes: m } = await params;
  if (!/^\d{4}$/.test(a) || !/^\d{1,2}$/.test(m)) notFound();
  const ano = Number(a);
  const mes = Number(m);
  if (mes < 1 || mes > 12) notFound();

  let snapshot: SnapshotPrestacao | null = null;
  let aviso: string | null = null;
  try {
    snapshot = await previaPrestacao(usuario, ano, mes);
  } catch (e) {
    if (e instanceof ErroApp && (e.codigo === "VALIDACAO" || e.codigo === "REGRA_DE_NEGOCIO")) aviso = e.message;
    else throw e;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <header className="flex items-center gap-2">
        <Link href="/relatorios/prestacao" aria-label="Voltar para prestação de contas" className="flex size-11 items-center justify-center rounded-full text-2xl text-marca-700 hover:bg-marca-50">
          <span aria-hidden="true">‹</span>
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-marca-900">Prestação de contas</h1>
          <p className="text-sm capitalize text-slate-600">{rotuloMesExtenso(ano, mes)}</p>
        </div>
      </header>

      {aviso || !snapshot ? (
        <Alerta tipo="erro">{aviso ?? "Não foi possível montar a prévia"}</Alerta>
      ) : (
        <>
          <Alerta tipo="info">Prévia: é exatamente isto que os membros verão. Nada foi publicado ainda.</Alerta>
          {pode(usuario.papeis, "financeiro.lancar") ? <PublicarPrestacao ano={ano} mes={mes} /> : null}
          <div className="rounded-2xl bg-background p-4 ring-1 ring-slate-300">
            <VisaoPrestacao snapshot={snapshot} />
          </div>
        </>
      )}
    </div>
  );
}
