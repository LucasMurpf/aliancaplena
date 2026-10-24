"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { rastrear } from "@/lib/metricas/cliente";

export type BarraCategoria = {
  nome: string;
  /** Valor já formatado em R$ (exibição). */
  valor: string;
  /** Percentual do total, já formatado. */
  percentual: string;
  /** Comprimento da barra (apenas geometria, nunca exibido). */
  barra: number;
  outras: boolean;
};

type Props = { titulo: string; grafico: "entradas" | "saidas"; cor: string; total: string; itens: BarraCategoria[] };

const ALTURA_LINHA = 48;
const MARGEM = 4;
const LARGURA_VALOR = 104;

type RotuloProps = { x?: number | string; y?: number | string; index?: number };

function Rotulo({ x, y, d, largura, maxChars }: RotuloProps & { d?: BarraCategoria; largura: number; maxChars: number }) {
  if (!d) return null;
  const nome = d.nome.length > maxChars ? `${d.nome.slice(0, maxChars - 1)}…` : d.nome;
  const py = Number(y);
  return (
    <g aria-hidden="true">
      <text x={Number(x)} y={py - 8} fontSize={13} fill="#1e293b">{nome}</text>
      <text x={largura - MARGEM} y={py - 8} fontSize={13} fontWeight={600} textAnchor="end" fill="#0f172a">
        {d.valor}
      </text>
    </g>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: BarraCategoria }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="font-semibold">{d.nome}</div>
      <div className="tabular-nums">{d.valor} ({d.percentual})</div>
    </div>
  );
}

export function GraficoCategorias({ titulo, grafico, cor, total, itens }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [interagiu, setInteragiu] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const obs = new ResizeObserver(() => setLargura(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, [itens.length]);

  function primeiraInteracao() {
    if (interagiu) return;
    setInteragiu(true);
    rastrear("grafico_interagido", { grafico });
  }

  const idTitulo = `grafico-${grafico}`;
  const altura = itens.length * ALTURA_LINHA + MARGEM * 2;
  const maxChars = Math.max(8, Math.floor((largura - LARGURA_VALOR) / 7.2));

  return (
    <section aria-labelledby={idTitulo} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={idTitulo} className="text-base font-semibold text-slate-900">{titulo}</h2>
        {itens.length > 0 && <span className="text-sm tabular-nums text-slate-700">{total}</span>}
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-slate-600">Sem movimentações neste mês</p>
      ) : (
        <>
          <div
            ref={caixa}
            aria-hidden="true"
            className="w-full"
            style={{ height: altura }}
            onMouseEnter={primeiraInteracao}
            onTouchStart={primeiraInteracao}
          >
            {largura > 0 && (
              <BarChart
                width={largura}
                height={altura}
                data={itens}
                layout="vertical"
                margin={{ top: MARGEM + 18, right: 0, bottom: MARGEM, left: 0 }}
                barCategoryGap={30}
                accessibilityLayer={false}
              >
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis type="category" dataKey="nome" hide />
                <Tooltip content={<Tip />} cursor={false} isAnimationActive={false} />
                <Bar
                  dataKey="barra"
                  barSize={12}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  fill={cor}
                  shape={(p: { x: number; y: number; width: number; height: number; index: number }) => (
                    <rect
                      x={p.x}
                      y={p.y}
                      width={Math.max(p.width, 2)}
                      height={p.height}
                      rx={4}
                      fill={itens[p.index]?.outras ? "#94a3b8" : cor}
                    />
                  )}
                  label={(p: RotuloProps) => (
                    <Rotulo {...p} d={itens[p.index ?? 0]} largura={largura} maxChars={maxChars} />
                  )}
                />
              </BarChart>
            )}
          </div>
          <table className="sr-only">
            <caption>{titulo}</caption>
            <thead>
              <tr><th scope="col">Categoria</th><th scope="col">Valor</th><th scope="col">Percentual</th></tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.nome}><th scope="row">{i.nome}</th><td>{i.valor}</td><td>{i.percentual}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
