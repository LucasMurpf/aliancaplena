import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { FormLancamento } from "@/components/FormLancamento";
import { obterUsuarioAtual } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { hojeSP } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { listarCategorias, listarContas } from "@/lib/services/cadastros";
import { obterLancamento } from "@/lib/services/lancamentos";

type Props = { params: Promise<{ id: string }> };

export default function PaginaEditarLancamento({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl" aria-busy="true" />}>
      <Editar params={params} />
    </Suspense>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function Editar({ params }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  const { id } = await params;
  if (!pode(usuario.papeis, "financeiro.lancar")) redirect(`/lancamentos/${id}`);

  const l = await obterLancamento(usuario, id).catch((e) => {
    if (e instanceof ErroApp && e.codigo === "NAO_ENCONTRADO") notFound();
    throw e;
  });
  if (l.status === "CANCELADO") redirect(`/lancamentos/${id}`);

  const [contas, categorias] = await Promise.all([
    listarContas(usuario, { incluirInativas: true }),
    listarCategorias(usuario, { incluirInativas: true }),
  ]);
  const realizado = l.status === "REALIZADO";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-marca-900">Editar lançamento</h1>
      <FormLancamento
        contas={contas.filter((c) => c.ativa || c.id === l.contaId).map((c) => ({ id: c.id, nome: c.nome }))}
        categorias={categorias
          .filter((c) => c.ativa || c.id === l.categoriaId)
          .map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, nominal: c.nominal }))}
        hoje={iso(hojeSP())}
        edicao={{
          id: l.id,
          versao: l.atualizadoEm.toISOString(),
          vencimentoOriginal: realizado ? iso(l.dataVencimento) : undefined,
          estado: {
            tipo: l.tipo,
            categoriaId: l.categoriaId,
            contaId: l.contaId,
            membro: l.membro ? { id: l.membro.id, nome: l.membro.nome } : null,
            valor: l.valor.toFixed(2).replace(".", ","),
            descricao: l.descricao ?? "",
            data: iso(realizado && l.dataRealizacao ? l.dataRealizacao : l.dataVencimento),
            realizado,
          },
        }}
      />
    </div>
  );
}
