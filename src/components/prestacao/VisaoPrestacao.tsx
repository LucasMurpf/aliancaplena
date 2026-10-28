// Corpo da prestação de contas, igual na prévia interna e na página pública.
// Recebe SÓ o snapshot (textos já formatados): nenhum tipo do Prisma, nenhum dado de pessoa.
// Componente de servidor sem estado nem leitura de sessão; fonte base 16px para leitura fácil.
import type { SnapshotPrestacao } from "@/lib/prestacao/snapshot";

type Props = {
  snapshot: SnapshotPrestacao;
  /** Mostra "versão N publicada em dd/mm/aaaa" quando já publicada (na prévia, fica de fora). */
  versao?: number;
  publicadaEm?: string;
};

function logoSegura(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${destaque ? "bg-marca-50 ring-marca-100" : "bg-white ring-slate-200"}`}>
      <dt className="text-base text-slate-700">{rotulo}</dt>
      <dd className="mt-1 break-words text-xl font-bold tabular-nums text-slate-900">{valor}</dd>
    </div>
  );
}

export function VisaoPrestacao({ snapshot: s, versao, publicadaEm }: Props) {
  const logo = logoSegura(s.igreja.logoUrl);
  return (
    <article className="space-y-6 text-base text-slate-900">
      <header className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo externa de domínio desconhecido
          <img src={logo} alt="" className="size-14 shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-200" />
        ) : (
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-marca-600 text-2xl text-white">
            ⛪
          </span>
        )}
        <div className="min-w-0">
          <p className="break-words text-lg font-semibold text-slate-800">{s.igreja.nome}</p>
          <h1 className="text-2xl font-bold text-marca-900">Prestação de contas</h1>
        </div>
      </header>

      <div>
        <p className="text-xl font-semibold text-slate-900">{s.rotulo}</p>
        {versao !== undefined && publicadaEm ? (
          <p className="text-base text-slate-700">
            Versão {versao} publicada em {publicadaEm}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="pc-resumo">
        <h2 id="pc-resumo" className="sr-only">
          Resumo
        </h2>
        <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Resumo rotulo="Entradas" valor={s.resumo.entradas} />
          <Resumo rotulo="Saídas" valor={s.resumo.saidas} />
          <Resumo rotulo="Resultado do mês" valor={s.resumo.resultado} destaque />
          <Resumo rotulo={`Saldo da igreja em ${s.dataCorte}`} valor={s.resumo.saldoFimMes} destaque />
        </dl>
      </section>

      <section aria-labelledby="pc-entradas">
        <h2 id="pc-entradas" className="mb-2 text-xl font-bold text-marca-900">
          Entradas por categoria
        </h2>
        {s.entradas.length === 0 ? (
          <p className="text-slate-700">Nenhuma entrada no período.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {s.entradas.map((c) => (
              <li key={c.categoria} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="min-w-0 break-words">{c.categoria}</span>
                <span className="shrink-0 font-semibold tabular-nums">{c.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pc-saidas">
        <h2 id="pc-saidas" className="mb-2 text-xl font-bold text-marca-900">
          Saídas por categoria
        </h2>
        {s.saidas.length === 0 ? (
          <p className="text-slate-700">Nenhuma saída no período.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {s.saidas.map((c) => (
              <li key={c.categoria} className="px-4 py-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words">{c.categoria}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{c.total}</span>
                </p>
                {c.itens && c.itens.length > 0 ? (
                  <ul className="mt-2 space-y-2 border-l-2 border-marca-100 pl-3">
                    {c.itens.map((i, n) => (
                      <li key={n} className="flex items-baseline justify-between gap-3 text-slate-800">
                        <span className="min-w-0 break-words">
                          <span className="tabular-nums text-slate-700">{i.data}</span> · {i.descricao}
                        </span>
                        <span className="shrink-0 tabular-nums">{i.valor}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
