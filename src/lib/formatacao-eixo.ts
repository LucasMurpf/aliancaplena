// Rótulo de eixo dos gráficos. Módulo sem imports (seguro para o bundle do navegador).
/** Rótulo curto de eixo, em reais, sem o símbolo ("1,5 mil"). Recebe número de geometria, nunca é fonte de valor exibido em texto de dados. */
export function compactoBRL(n: number): string {
  const abs = Math.abs(n);
  const sinal = n < 0 ? "−" : "";
  const fmt = (x: number) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (abs >= 1_000_000) return `${sinal}${fmt(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}${fmt(abs / 1_000)} mil`;
  return `${sinal}${Math.round(abs)}`;
}
