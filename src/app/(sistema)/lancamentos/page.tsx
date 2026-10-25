import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FiltrosLancamentos } from "@/components/FiltrosLancamentos";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { ErroApp } from "@/lib/erros";
import { filtrosParaQuery, parseFiltros, type ParametrosUrl } from "@/lib/filtros-lancamentos";
import { pode } from "@/lib/permissoes";
import { listarCategorias, listarContas, obterMembro } from "@/lib/services/cadastros";
import { ITENS_POR_PAGINA, listarLancamentos, type LancamentoListado } from "@/lib/services/lancamentos";

type Props = { searchParams: Promise<ParametrosUrl> };

export default function PaginaLancamentos({ searchParams }: Props) {
  // Sessão e dados são lidos em requisição: ficam atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Lista searchParams={searchParams} />
    </Suspense>
  );
}

type Linha = {
  id: string;
  titulo: string;
  /** Segunda linha: categoria (se o título é a descrição) e membro. */
  detalhe: string;
  categoria: string;
  conta: string;
  membro: string | null;
  data: string;
  previsto: boolean;
  cancelado: boolean;
  entrada: boolean;
  valor: string;
};

function linha(l: LancamentoListado): Linha {
  const efetiva = l.status === "REALIZADO" && l.dataRealizacao ? l.dataRealizacao : l.dataVencimento;
  return {
    id: l.id,
    titulo: l.descricao?.trim() || l.categoria.nome,
    detalhe: [l.descricao?.trim() ? l.categoria.nome : null, l.membro?.nome ?? null].filter(Boolean).join(" · "),
    categoria: l.categoria.nome,
    conta: l.conta.nome,
    membro: l.membro?.nome ?? null,
    data: formatarDataBR(efetiva),
    previsto: l.status === "PREVISTO",
    cancelado: l.status === "CANCELADO",
    entrada: l.tipo === "ENTRADA",
    valor: formatarBRL(l.valor),
  };
}

/** Rodapé: "Realizado: Entradas R$ X · Saídas R$ Y" (e o mesmo para Previsto). */
function LinhaSomas(p: { rotulo: string; entradas: string; saidas: string; previsto?: boolean }) {
  return (
    <p className={`flex flex-wrap gap-x-2 ${p.previsto ? "text-xs text-slate-600" : ""}`}>
      <span className="text-slate-800">{p.rotulo}:</span>
      <span className={p.previsto ? "" : "text-emerald-700"}>Entradas {p.entradas}</span>
      <span className="text-slate-400" aria-hidden="true">
        ·
      </span>
      <span className={p.previsto ? "" : "text-red-700"}>Saídas {p.saidas}</span>
    </p>
  );
}

function Selo({ l }: { l: Linha }) {
  if (l.cancelado) return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Cancelado</span>;
  if (l.previsto) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Previsto</span>;
  return null;
}

const corValor = (l: Linha) => (l.cancelado ? "text-slate-500 line-through" : l.entrada ? "text-emerald-700" : "text-red-700");

async function Lista({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");

  const podeMembro = pode(usuario.papeis, "membros.ver_nomes");
  const filtro = parseFiltros(await searchParams);
  // Sem permissão para ver nomes, o filtro por membro seria um jeito de descobrir quem contribuiu.
  if (!podeMembro) delete filtro.membroId;
  const [resultado, categorias, contas, membro] = await Promise.all([
    listarLancamentos(usuario, filtro),
    listarCategorias(usuario, { incluirInativas: true }),
    listarContas(usuario, { incluirInativas: true }),
    podeMembro && filtro.membroId ? obterMembro(usuario, filtro.membroId).catch((e) => {
          if (e instanceof ErroApp) return null;
          throw e;
        }) : null,
  ]);

  const pagina = filtro.pagina ?? 1;
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / ITENS_POR_PAGINA));
  const hoje = hojeSP();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const mesAtual = {
    de: iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))),
    ate: iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0))),
  };
  const linhas = resultado.itens.map(linha);
  const href = (n: number) => {
    const q = filtrosParaQuery({ ...filtro, pagina: n });
    return q ? `/lancamentos?${q}` : "/lancamentos";
  };
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-20">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Lançamentos</h1>
          <p className="text-sm text-slate-600">
            {resultado.total} {resultado.total === 1 ? "lançamento" : "lançamentos"} no filtro
          </p>
        </div>
        {podeLancar ? (
          <Link
            href="/lancamentos/novo"
            className="hidden min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700 md:inline-flex"
          >
            Novo lançamento
          </Link>
        ) : null}
      </header>

      <p>
        <Link href="/transferencias" className="inline-flex min-h-11 items-center text-sm font-semibold text-marca-700 hover:underline">
          Ver transferências
        </Link>
      </p>

      <FiltrosLancamentos
        // Recria o formulário quando a URL muda (voltar do navegador, "Limpar").
        key={filtrosParaQuery({ ...filtro, pagina: 1 })}
        filtros={filtro}
        categorias={categorias.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo }))}
        contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
        membro={membro ? { id: membro.id, nome: membro.nome } : null}
        podeFiltrarMembro={podeMembro}
        mesAtual={mesAtual}
      />

      {linhas.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhum lançamento encontrado</p>
          <p className="mt-1 text-sm text-slate-600">Mude os filtros ou registre um novo lançamento.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {linhas.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/lancamentos/${l.id}`}
                  className={`flex items-start justify-between gap-3 rounded-xl border-l-4 bg-white p-3 shadow-sm ring-1 ring-slate-200 ${
                    l.cancelado ? "border-slate-300" : l.previsto ? "border-amber-400" : l.entrada ? "border-emerald-500" : "border-red-500"
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate font-semibold ${l.cancelado ? "text-slate-500" : "text-slate-900"}`}>{l.titulo}</span>
                    {l.detalhe ? <span className="block truncate text-sm text-slate-700">{l.detalhe}</span> : null}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="tabular-nums">{l.data}</span>
                      <span>{l.conta}</span>
                      <Selo l={l} />
                    </span>
                  </span>
                  <span className={`shrink-0 text-base font-bold tabular-nums ${corValor(l)}`}>
                    {l.entrada ? "+" : "−"} {l.valor}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Descrição</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Conta</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.id} className="hover:bg-marca-50/50">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {l.data} <Selo l={l} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/lancamentos/${l.id}`} className="font-semibold text-marca-700 hover:underline">
                        {l.titulo}
                      </Link>
                      {l.membro ? <span className="block text-xs text-slate-600">{l.membro}</span> : null}
                    </td>
                    <td className="px-4 py-3">{l.categoria}</td>
                    <td className="px-4 py-3">{l.conta}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${corValor(l)}`}>
                      {l.entrada ? "+" : "−"} {l.valor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 ? (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-2">
              {pagina > 1 ? (
                <Link href={href(pagina - 1)} className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-slate-300">
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-slate-700">
                Página {pagina} de {totalPaginas}
              </p>
              {pagina < totalPaginas ? (
                <Link href={href(pagina + 1)} className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-slate-300">
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 py-2 pl-4 pr-24 backdrop-blur lg:left-64 lg:pl-8">
        <div className="flex flex-col gap-0.5 text-sm font-semibold tabular-nums" aria-live="polite">
          <LinhaSomas
            rotulo="Realizado"
            entradas={formatarBRL(resultado.somaEntradasRealizadas)}
            saidas={formatarBRL(resultado.somaSaidasRealizadas)}
          />
          {resultado.haPrevistos ? (
            <LinhaSomas
              rotulo="Previsto"
              entradas={formatarBRL(resultado.somaEntradasPrevistas)}
              saidas={formatarBRL(resultado.somaSaidasPrevistas)}
              previsto
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
