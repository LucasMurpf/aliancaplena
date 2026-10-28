import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { descricaoDiferenca, formatarDataHora, ROTULO_MODO } from "@/components/calculadora/formatacao";
import { obterUsuarioAtual } from "@/lib/auth";
import { formatarBRL } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { listarContas } from "@/lib/services/cadastros";
import { ITENS_POR_PAGINA_CONTAGENS, listarContagens } from "@/lib/services/contagens";

type Props = { searchParams: Promise<{ conta?: string | string[]; pagina?: string | string[] }> };

export default function PaginaCalculadora(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <Historico {...props} />
    </Suspense>
  );
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Historico({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");

  const sp = await searchParams;
  const contas = await listarContas(usuario, { incluirInativas: true });
  const contaId = contas.some((c) => c.id === um(sp.conta)) ? um(sp.conta) : undefined;
  const n = Number(um(sp.pagina));
  const pagina = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const resultado = await listarContagens(usuario, { contaId, pagina });
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / ITENS_POR_PAGINA_CONTAGENS));
  const podeLancar = pode(usuario.papeis, "financeiro.lancar");
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (contaId) q.set("conta", contaId);
    if (p > 1) q.set("pagina", String(p));
    return q.size ? `/calculadora?${q}` : "/calculadora";
  };
  const linhas = resultado.itens.map((c) => ({
    ...c,
    dif: descricaoDiferenca(c.diferenca),
    quando: c.data ?? formatarDataHora(c.criadoEm),
    contado: formatarBRL(c.totalContado),
    esperadoTxt: formatarBRL(c.esperado),
  }));
  const botaoPagina = "inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-slate-300";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Calculadora de cédulas</h1>
          <p className="text-sm text-slate-600">
            {resultado.total} {resultado.total === 1 ? "contagem registrada" : "contagens registradas"}
          </p>
        </div>
        {podeLancar ? (
          <Link href="/calculadora/nova" className="inline-flex min-h-11 items-center rounded-lg bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
            Nova contagem
          </Link>
        ) : null}
      </header>

      <form method="get" action="/calculadora" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-conta" className="text-sm font-medium text-slate-800">
            Conta
          </label>
          <select id="filtro-conta" name="conta" defaultValue={contaId ?? ""} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900">
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-slate-300 hover:bg-slate-50">
          Filtrar
        </button>
      </form>

      {linhas.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-900">Nenhuma contagem encontrada</p>
          <p className="mt-1 text-sm text-slate-600">{podeLancar ? "Toque em Nova contagem para conferir o dinheiro do culto ou do caixa." : "Ainda não há contagens registradas."}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {linhas.map((c) => (
              <li key={c.id}>
                <Link href={`/calculadora/${c.id}`} className="block rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">
                        {ROTULO_MODO[c.modo]} · {c.conta}
                      </span>
                      <span className="block text-xs text-slate-600 tabular-nums">{c.quando} · {c.criadoPor}</span>
                    </span>
                    <span className={`shrink-0 text-sm font-bold ${c.dif.classe}`}>{c.dif.texto}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-700 tabular-nums">
                    Contado {c.contado} · Esperado {c.esperadoTxt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Quando</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Conta</th>
                  <th className="px-4 py-3 text-right font-semibold">Contado</th>
                  <th className="px-4 py-3 text-right font-semibold">Esperado</th>
                  <th className="px-4 py-3 font-semibold">Diferença</th>
                  <th className="px-4 py-3 font-semibold">Contado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((c) => (
                  <tr key={c.id} className="hover:bg-marca-50/50">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <Link href={`/calculadora/${c.id}`} className="font-semibold text-marca-700 hover:underline">
                        {c.quando}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ROTULO_MODO[c.modo]}</td>
                    <td className="px-4 py-3">{c.conta}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{c.contado}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{c.esperadoTxt}</td>
                    <td className={`whitespace-nowrap px-4 py-3 font-semibold ${c.dif.classe}`}>{c.dif.texto}</td>
                    <td className="px-4 py-3">{c.criadoPor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 ? (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-2">
              {pagina > 1 ? <Link href={href(pagina - 1)} className={botaoPagina}>Anterior</Link> : <span />}
              <p className="text-sm text-slate-700">
                Página {pagina} de {totalPaginas}
              </p>
              {pagina < totalPaginas ? <Link href={href(pagina + 1)} className={botaoPagina}>Próxima</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
