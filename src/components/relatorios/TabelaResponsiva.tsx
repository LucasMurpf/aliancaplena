import type { ReactNode } from "react";

export type Coluna = { rotulo: string; direita?: boolean };
export type LinhaTabela = { chave: string; celulas: ReactNode[]; destaque?: boolean };

type Props = { legenda: string; colunas: Coluna[]; linhas: LinhaTabela[]; rodape?: ReactNode[] };

/** Cartões no celular (1ª coluna é o título) e tabela a partir de md. */
export function TabelaResponsiva({ legenda, colunas, linhas, rodape }: Props) {
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden" aria-label={legenda}>
        {linhas.map((l) => (
          <li key={l.chave} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <p className="break-words font-semibold text-slate-900">{l.celulas[0]}</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {colunas.slice(1).map((c, i) => (
                <div key={c.rotulo} className="contents">
                  <dt className="text-slate-600">{c.rotulo}</dt>
                  <dd className="break-words text-right font-medium tabular-nums text-slate-900">{l.celulas[i + 1]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {rodape ? (
          <li className="rounded-xl bg-marca-50 p-3 text-sm font-bold text-marca-900 ring-1 ring-marca-100">
            <span className="flex justify-between gap-3">
              <span>{rodape[0]}</span>
              <span className="tabular-nums">{rodape[rodape.length - 1]}</span>
            </span>
          </li>
        ) : null}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              {colunas.map((c) => (
                <th key={c.rotulo} scope="col" className={`px-4 py-3 font-semibold ${c.direita ? "text-right" : ""}`}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.chave}>
                {l.celulas.map((cel, i) => (
                  <td key={colunas[i].rotulo} className={`px-4 py-3 ${colunas[i].direita ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                    {cel}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {rodape ? (
            <tfoot className="border-t border-slate-200 bg-marca-50 font-bold text-marca-900">
              <tr>
                {rodape.map((cel, i) => (
                  <td key={colunas[i].rotulo} className={`px-4 py-3 ${colunas[i].direita ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                    {cel}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}
