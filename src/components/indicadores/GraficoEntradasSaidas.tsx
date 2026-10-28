"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { compactoBRL, type MesTela } from "@/lib/indicadores-tela";
import { CartaoGrafico, COR, Dica, Legenda, type LinhaDica } from "./comum";
import { useLargura } from "./use-largura";

const ALTURA = 280;
const LINHAS: LinhaDica[] = [
  { chave: "entradas", rotulo: "Entradas", cor: COR.entradas, textoChave: "tEntradas" },
  { chave: "saidas", rotulo: "Saídas", cor: COR.saidas, textoChave: "tSaidas" },
  { chave: "resultado", rotulo: "Resultado", cor: COR.resultado, textoChave: "tResultado" },
];

export function GraficoEntradasSaidas({ meses }: { meses: MesTela[] }) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const dados = meses.map((m) => ({
    rotulo: m.rotulo,
    longo: m.rotuloLongo,
    entradas: m.entradas.valor,
    saidas: m.saidas.valor,
    resultado: m.resultado.valor,
    tEntradas: m.entradas.texto,
    tSaidas: m.saidas.texto,
    tResultado: m.resultado.texto,
  }));
  const aria = `Entradas, saídas e resultado de cada um dos últimos 13 meses, de ${meses[0].rotuloLongo} a ${meses[meses.length - 1].rotuloLongo}. Os valores estão na tabela abaixo.`;

  return (
    <CartaoGrafico
      id="ind-entradas-saidas"
      titulo="Entradas e saídas por mês"
      subtitulo="Em reais. Barras: quanto entrou e quanto saiu em cada mês. Linha: o resultado (entradas menos saídas)."
    >
      <Legenda
        itens={[
          { rotulo: "Entradas", cor: COR.entradas },
          { rotulo: "Saídas", cor: COR.saidas },
          { rotulo: "Resultado", cor: COR.resultado, tipo: "linha" },
        ]}
      />
      <div ref={ref} role="img" aria-label={aria} className="w-full" style={{ height: ALTURA }}>
        {largura > 0 && (
          <ComposedChart width={largura} height={ALTURA} data={dados} margin={{ top: 12, right: 24, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={COR.grade} />
            <XAxis dataKey="rotulo" interval={largura < 420 ? 2 : largura < 520 ? 1 : 0} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={{ stroke: COR.grade }} />
            <YAxis width={56} tickFormatter={compactoBRL} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke={COR.eixo} strokeWidth={1} />
            <Tooltip content={<Dica linhas={LINHAS} />} cursor={{ fill: "#f1f5f9" }} isAnimationActive={false} />
            <Bar dataKey="entradas" fill={COR.entradas} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="saidas" fill={COR.saidas} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} stroke="#fff" strokeWidth={1} />
            <Line
              type="linear"
              dataKey="resultado"
              stroke={COR.resultado}
              strokeWidth={2}
              dot={{ r: 3.5, fill: COR.resultado, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </div>
      <div className="sr-only">
        <table>
          <caption>Entradas, saídas e resultado por mês</caption>
          <thead>
            <tr><th scope="col">Mês</th><th scope="col">Entradas</th><th scope="col">Saídas</th><th scope="col">Resultado</th></tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.rotulo}>
                <th scope="row">{m.rotuloLongo}</th><td>{m.entradas.texto}</td><td>{m.saidas.texto}</td><td>{m.resultado.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CartaoGrafico>
  );
}
