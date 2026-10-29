import type { ReactNode } from "react";

/** Cores (paleta validada: azul e laranja separam sob daltonismo; categorias seguem a ordem fixa). */
export const COR = {
  entradas: "#2a78d6",
  saidas: "#eb6834",
  resultado: "#1e293b",
  saldo: "#2a78d6",
  outras: "#94a3b8",
  categorias: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  grade: "#e2e8f0",
  eixo: "#64748b",
} as const;

export function CartaoGrafico({
  id,
  titulo,
  subtitulo,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 id={id} className="text-base font-semibold text-slate-900">{titulo}</h2>
      <p className="mb-3 mt-0.5 text-sm text-slate-600">{subtitulo}</p>
      {children}
    </section>
  );
}

export type ItemLegenda = { rotulo: string; cor: string; tipo?: "quadrado" | "linha" };

export function Legenda({ itens }: { itens: ItemLegenda[] }) {
  return (
    <ul aria-hidden="true" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          {i.tipo === "linha" ? (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.cor }} />
          ) : (
            <span className="inline-block size-3 rounded-sm" style={{ background: i.cor }} />
          )}
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}

export type LinhaDica = { chave: string; rotulo: string; cor: string; textoChave: string };

type DicaProps = { active?: boolean; payload?: { payload: Record<string, unknown> }[]; linhas: LinhaDica[]; omitirZeros?: boolean };

/** Tooltip com valores já formatados em R$ (lidos de campos de texto da própria linha). */
export function Dica({ active, payload, linhas, omitirZeros }: DicaProps) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const visiveis = omitirZeros ? linhas.filter((l) => Number(d[l.chave]) !== 0) : linhas;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="mb-1 font-semibold first-letter:uppercase">{String(d.longo)}</div>
      {visiveis.map((l) => (
        <div key={l.chave} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: l.cor }} />
            {l.rotulo}
          </span>
          <span>{String(d[l.textoChave])}</span>
        </div>
      ))}
    </div>
  );
}
