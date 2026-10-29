// Lógica pura da calculadora de cédulas no navegador (sem Prisma). Só inteiros em centavos.
import { destinoDoErro } from "./form-lancamento";

export type DenominacaoCliente = { centavos: number; rotulo: string; tipo: "cedula" | "moeda" };

/** Cópia das denominações do serviço (um teste confere que continuam iguais). */
export const DENOMINACOES_CLIENTE: readonly DenominacaoCliente[] = [
  { centavos: 20000, rotulo: "R$ 200,00", tipo: "cedula" },
  { centavos: 10000, rotulo: "R$ 100,00", tipo: "cedula" },
  { centavos: 5000, rotulo: "R$ 50,00", tipo: "cedula" },
  { centavos: 2000, rotulo: "R$ 20,00", tipo: "cedula" },
  { centavos: 1000, rotulo: "R$ 10,00", tipo: "cedula" },
  { centavos: 500, rotulo: "R$ 5,00", tipo: "cedula" },
  { centavos: 200, rotulo: "R$ 2,00", tipo: "cedula" },
  { centavos: 100, rotulo: "R$ 1,00", tipo: "moeda" },
  { centavos: 50, rotulo: "R$ 0,50", tipo: "moeda" },
  { centavos: 25, rotulo: "R$ 0,25", tipo: "moeda" },
  { centavos: 10, rotulo: "R$ 0,10", tipo: "moeda" },
  { centavos: 5, rotulo: "R$ 0,05", tipo: "moeda" },
  { centavos: 1, rotulo: "R$ 0,01", tipo: "moeda" },
];

export function calcularTotalCentavos(itens: { denominacaoCentavos: number; quantidade: number }[]): number {
  return itens.reduce((acc, i) => acc + i.denominacaoCentavos * i.quantidade, 0);
}

/** "R$ 1.234,56"; negativo "-R$ 30,00". */
export function formatarCentavos(n: number): string {
  const negativo = n < 0;
  const abs = Math.abs(Math.trunc(n));
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negativo ? "-" : ""}R$ ${inteiro},${centavos}`;
}

export type EstadoDiferenca = "ok" | "falta" | "sobra";

export function descreverDiferenca(diferencaCentavos: number): { texto: string; estado: EstadoDiferenca } {
  if (diferencaCentavos === 0) return { texto: "Confere", estado: "ok" };
  if (diferencaCentavos < 0) return { texto: `Faltam ${formatarCentavos(-diferencaCentavos)}`, estado: "falta" };
  return { texto: `Sobram ${formatarCentavos(diferencaCentavos)}`, estado: "sobra" };
}

/** Conta padrão da contagem: a primeira do tipo CAIXA (ordem recebida); sem CAIXA, a primeira; sem contas, "". */
export function contaPadraoId(contas: readonly { id: string; tipo: string }[]): string {
  return (contas.find((c) => c.tipo === "CAIXA") ?? contas[0])?.id ?? "";
}

export const MSG_ESPERADO_MUDOU = "O valor esperado mudou (alguém lançou algo agora). Confira a diferença e informe a observação.";

/** A observação só vale quando há diferença na tela; com "Confere" nada é enviado. */
export function observacaoParaEnvio(observacao: string, diferencaCentavos: number): string | undefined {
  const o = observacao.trim();
  return diferencaCentavos !== 0 && o ? observacao : undefined;
}

/**
 * Para onde vai o erro do registro: no campo, se ele está visível; senão, mensagem geral.
 * Divergência que a tela não mostrava (esperado mudou) ganha a mensagem própria.
 */
export function destinoErroContagem(
  r: { campo?: string; regra?: string; erro: string },
  camposVisiveis: readonly string[],
  mapa: Record<string, string> = {},
): { campo: string | null; mensagem: string } {
  const campo = destinoDoErro(r.campo, camposVisiveis, mapa);
  if (campo) return { campo, mensagem: r.erro };
  if (r.regra === "obrigatorio_divergencia") return { campo: null, mensagem: MSG_ESPERADO_MUDOU };
  return { campo: null, mensagem: r.erro };
}
