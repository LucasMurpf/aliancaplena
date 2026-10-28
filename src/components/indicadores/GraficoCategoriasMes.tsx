"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { compactoBRL, type MesTela, type TelaIndicadores } from "@/lib/indicadores-tela";
import { CartaoGrafico, COR, Dica, Legenda, type LinhaDica } from "./comum";
import { useLargura } from "./use-largura";

const ALTURA = 280;

export function GraficoCategoriasMes({ meses, categorias }: { meses: MesTela[]; categorias: TelaIndicadores["categorias"] }) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const cor = (nome: string, i: number) => (nome === "Outras" ? COR.outras : COR.categorias[i % COR.categorias.length]);
  const linhas: LinhaDica[] = categorias.map((c, i) => ({ chave: `c${i}`, rotulo: c.nome, cor: cor(c.nome, i), textoChave: `t${i}` }));
  const dados = meses.map((m, mi) => {
    const linha: Record<string, string | number> = { rotulo: m.rotulo, longo: m.rotuloLongo };
    categorias.forEach((c, i) => {
      linha[`c${i}`] = c.valores[mi].valor;
      linha[`t${i}`] = c.valores[mi].texto;
    });
    return linha;
  });
  const aria = `Arrecadação por categoria em cada um dos últimos 13 meses: ${categorias.map((c) => c.nome).join(", ")}. Os valores estão na tabela abaixo.`;

  return (
    <CartaoGrafico
      id="ind-categorias"
      titulo="Arrecadação por categoria"
      subtitulo="Como as entradas de cada mês se dividem entre as cinco maiores categorias; as demais ficam em “Outras”."
    >
      <Legenda itens={categorias.map((c, i) => ({ rotulo: c.nome, cor: cor(c.nome, i) }))} />
      <div ref={ref} role="img" aria-label={aria} className="w-full" style={{ height: ALTURA }}>
        {largura > 0 && (
          <BarChart width={largura} height={ALTURA} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={COR.grade} />
            <XAxis dataKey="rotulo" interval={largura < 520 ? 1 : 0} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={{ stroke: COR.grade }} />
            <YAxis width={64} tickFormatter={compactoBRL} tick={{ fontSize: 12, fill: COR.eixo }} tickLine={false} axisLine={false} />
            <Tooltip content={<Dica linhas={linhas} omitirZeros />} cursor={{ fill: "#f1f5f9" }} isAnimationActive={false} />
            {categorias.map((c, i) => (
              <Bar key={c.nome} dataKey={`c${i}`} stackId="cat" fill={cor(c.nome, i)} stroke="#fff" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        )}
      </div>
      <div className="sr-only">
        <table>
          <caption>Arrecadação por categoria e mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              {categorias.map((c) => <th key={c.nome} scope="col">{c.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {meses.map((m, mi) => (
              <tr key={m.rotulo}>
                <th scope="row">{m.rotuloLongo}</th>
                {categorias.map((c) => <td key={c.nome}>{c.valores[mi].texto}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CartaoGrafico>
  );
}
