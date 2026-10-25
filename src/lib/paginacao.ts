// Número de página vindo da URL (funções puras; também rodam no navegador).

/** Acima disso a página é tratada como inválida: evita `skip` gigante (1e21, Infinity) → erro 500. */
export const PAGINA_MAXIMA = 10_000;

/** Página válida = inteiro seguro de 1 a PAGINA_MAXIMA; qualquer outra coisa vira 1. */
export function parsePagina(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= PAGINA_MAXIMA ? n : 1;
}
