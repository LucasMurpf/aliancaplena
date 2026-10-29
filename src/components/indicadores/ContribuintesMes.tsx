import type { MesTela } from "@/lib/indicadores-tela";
import { CartaoGrafico, COR } from "./comum";

const ALTURA = 96;

export function ContribuintesMes({ meses }: { meses: MesTela[] }) {
  const max = Math.max(1, ...meses.map((m) => m.contribuintes));
  const aria = `Quantidade de membros que contribuíram em cada um dos últimos 13 meses. Em ${meses[meses.length - 1].rotuloLongo}: ${meses[meses.length - 1].contribuintes}. Os valores estão na tabela abaixo.`;
  return (
    <CartaoGrafico
      id="ind-contribuintes"
      titulo="Contribuintes por mês"
      subtitulo="Quantos membros diferentes fizeram contribuições identificadas em cada mês. Só o número, sem nomes."
    >
      <div role="img" aria-label={aria}>
        <ol aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {meses.map((m, i) => {
            const [abrev, ano] = m.rotulo.split("/");
            const mostraAno = i === 0 || abrev === "jan";
            return (
              <li key={m.rotulo} className="flex flex-col items-center">
                <span className="text-xs font-semibold tabular-nums text-slate-800">{m.contribuintes}</span>
                <span className="flex w-full items-end justify-center" style={{ height: ALTURA }}>
                  <span
                    className="block w-full max-w-5 rounded-t"
                    style={{ height: Math.max(2, (m.contribuintes / max) * ALTURA), background: COR.entradas }}
                  />
                </span>
                <span className="mt-1 text-xs text-slate-600">{abrev}</span>
                <span className="h-4 text-[11px] leading-4 text-slate-500">{mostraAno ? ano : ""}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="sr-only">
        <table>
          <caption>Membros distintos que contribuíram em cada mês</caption>
          <thead><tr><th scope="col">Mês</th><th scope="col">Contribuintes</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.rotulo}><th scope="row">{m.rotuloLongo}</th><td>{m.contribuintes}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </CartaoGrafico>
  );
}
