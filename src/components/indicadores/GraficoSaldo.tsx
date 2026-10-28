"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { MesTela } from "@/lib/indicadores-tela";
import { compactoBRL } from "@/lib/formatacao-eixo";
import { CartaoGrafico, COR, Dica, type LinhaDica } from "./comum";
import { useLargura } from "./use-largura";

const ALTURA = 240;
const LINHAS: LinhaDica[] = [{ chave: "saldo", rotulo: "Saldo", cor: COR.saldo, textoChave: "tSaldo" }];

export function GraficoSaldo({ meses }: { meses: MesTela[] }) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const dados = meses.map((m) => ({ rotulo: m.rotulo, longo: m.rotuloLongo, saldo: m.saldoFim.valor, tSaldo: m.saldoFim.texto }));
  const ultimo = meses[meses.length - 1];
  const aria = `Saldo total ao fim de cada um dos últimos 13 meses. Em ${ultimo.rotuloLongo}: ${ultimo.saldoFim.texto}. Os valores estão na tabela abaixo.`;

  return (
    <CartaoGrafico
      id="ind-saldo"
      titulo="Saldo ao fim de cada mês"
      subtitulo="Em reais. Quanto havia, somando todas as contas, no último dia de cada mês."
    >
      <div ref={ref} role="img" aria-label={aria} className="w-full" style={{ height: ALTURA }}>
        {largura > 0 && (
          <LineChart width={largura} height={ALTURA} data={dados} margin={{ top: 12, right: 24, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={COR.grade} />
            <XAxis dataKey="rotulo" interval={largura < 420 ? 2 : largura < 520 ? 1 : 0} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={{ stroke: COR.grade }} />
            <YAxis width={56} tickFormatter={compactoBRL} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ReferenceLine y={0} stroke={COR.eixo} strokeWidth={1} />
            <Tooltip content={<Dica linhas={LINHAS} />} cursor={{ stroke: COR.eixo, strokeDasharray: "3 3" }} isAnimationActive={false} />
            <Line
              type="linear"
              dataKey="saldo"
              stroke={COR.saldo}
              strokeWidth={2}
              dot={{ r: 3.5, fill: COR.saldo, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </div>
      <div className="sr-only">
        <table>
          <caption>Saldo total ao fim de cada mês</caption>
          <thead><tr><th scope="col">Mês</th><th scope="col">Saldo</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.rotulo}><th scope="row">{m.rotuloLongo}</th><td>{m.saldoFim.texto}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </CartaoGrafico>
  );
}
