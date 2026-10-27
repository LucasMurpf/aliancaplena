import { Prisma } from "@prisma/client";
import { VALOR_MAXIMO } from "@/lib/dinheiro";
import { Validacao } from "@/lib/erros";

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** Escalas dos quatro grupos de três dígitos: bilhões, milhões, milhares e unidades. */
const ESCALAS = [1e9, 1e6, 1e3, 1];

/** 0 a 999 por extenso, com "e" entre centenas, dezenas e unidades. */
function ateNovecentosNoventaNove(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto >= 10 && resto < 20) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else if (resto >= 20) {
    partes.push(DEZENAS[Math.floor(resto / 10)]);
    if (resto % 10 > 0) partes.push(UNIDADES[resto % 10]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(" e ");
}

/** Texto de um grupo de três dígitos na posição `indice` de ESCALAS. */
function textoDoGrupo(grupo: number, indice: number): string {
  if (indice === 0) return grupo === 1 ? "um bilhão" : `${ateNovecentosNoventaNove(grupo)} bilhões`;
  if (indice === 1) return grupo === 1 ? "um milhão" : `${ateNovecentosNoventaNove(grupo)} milhões`;
  if (indice === 2) return grupo === 1 ? "mil" : `${ateNovecentosNoventaNove(grupo)} mil`;
  return ateNovecentosNoventaNove(grupo);
}

/** Parte inteira (n >= 1) por extenso, sem a palavra "real" e sem o "de" de milhões exatos. */
function inteiroPorExtenso(n: number): string {
  let texto = "";
  for (let i = 0; i < ESCALAS.length; i++) {
    const grupo = Math.floor(n / ESCALAS[i]) % 1000;
    if (grupo === 0) continue;
    if (texto) {
      // "e" antes do último grupo quando o trecho que começa aqui é < 100 ou múltiplo de 100.
      const trecho = n % ESCALAS[i - 1];
      texto += trecho < 100 || trecho % 100 === 0 ? " e " : " ";
    }
    texto += textoDoGrupo(grupo, i);
  }
  return texto;
}

/**
 * Converte um valor monetário em reais para extenso em pt-BR.
 * Aceita valores de 0,01 a 9.999.999.999,99; fora disso lança `Validacao`.
 */
export function valorPorExtenso(valor: Prisma.Decimal | string): string {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(valor);
  } catch {
    throw new Validacao("Valor inválido");
  }
  if (!decimal.isFinite() || decimal.lte(0) || decimal.gt(VALOR_MAXIMO) || decimal.decimalPlaces() > 2) {
    throw new Validacao("Valor fora do intervalo para extenso");
  }

  const [parteInteira, parteCentavos = "0"] = decimal.toFixed(2).split(".");
  const reais = Number(parteInteira);
  const centavos = Number(parteCentavos);

  const partes: string[] = [];
  if (reais > 0) {
    // "de" após milhões e bilhões exatos: "um milhão de reais".
    const de = reais >= 1e6 && reais % 1e6 === 0 ? " de" : "";
    partes.push(`${inteiroPorExtenso(reais)}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    partes.push(centavos === 1 ? "um centavo" : `${ateNovecentosNoventaNove(centavos)} centavos`);
  }
  return partes.join(" e ");
}
