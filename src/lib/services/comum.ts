// Helpers de validação compartilhados pelos serviços financeiros.
import { z } from "zod";
import { parseDataBR } from "@/lib/datas";
import { parseValorBR } from "@/lib/dinheiro";
import { Validacao } from "@/lib/erros";

export const esquemaId = (msg: string) => z.string({ error: msg }).trim().min(1, msg);
/**
 * Converte dentro de um transform sem lançar: a falha vira um issue (com `regra`), para que
 * `validar` saiba qual campo errou.
 */
export function converterOuIssue<T>(
  ctx: { issues: z.core.$ZodRawIssue[] },
  entrada: string,
  converter: (t: string) => T,
  regra = "invalido",
): T {
  try {
    return converter(entrada);
  } catch (e) {
    if (!(e instanceof Validacao)) throw e;
    ctx.issues.push({ code: "custom", message: e.message, input: entrada, params: { regra } });
    return z.NEVER;
  }
}

/** Valor em reais digitado (vazio → "obrigatorio"; fora do padrão → "invalido"). */
export const esquemaValor = z.string({ error: "Valor inválido" }).transform((t, ctx) => {
  if (t.trim() === "") {
    ctx.issues.push({ code: "custom", message: "Informe o valor", input: t, params: { regra: "obrigatorio" } });
    return z.NEVER;
  }
  return converterOuIssue(ctx, t, (x) => parseValorBR(x));
});

export const esquemaData = z
  .string({ error: "Data inválida" })
  .trim()
  .transform((t, ctx) => converterOuIssue(ctx, t, parseDataBR));
export const esquemaDataOpcional = z
  .string({ error: "Data inválida" })
  .trim()
  .optional()
  .transform((t, ctx) => (t ? converterOuIssue(ctx, t, parseDataBR) : undefined));
export const esquemaTextoOpcional = z
  .string({ error: "Texto inválido" })
  .trim()
  .optional()
  .transform((t) => (t ? t : undefined));
export const esquemaMotivo = z
  .string({ error: "Informe o motivo do cancelamento" })
  .trim()
  .min(1, "Informe o motivo do cancelamento");

type OpcoesValidar = {
  /** Campo a informar quando o issue não tem caminho (esquema de um valor só). */
  campo?: string;
  /** Nome do campo do formulário para cada chave do esquema (ex.: categoriaId → categoria). */
  campos?: Record<string, string>;
};

function regraDoIssue(i: z.core.$ZodIssue): string {
  const params = (i as { params?: { regra?: unknown } }).params;
  if (typeof params?.regra === "string") return params.regra;
  if (i.code === "too_small") return "obrigatorio";
  if (i.code === "invalid_type" && i.input === undefined) return "obrigatorio";
  return "invalido";
}

export function validar<T>(esquema: z.ZodType<T, unknown>, dados: unknown, opcoes: OpcoesValidar = {}): T {
  const r = esquema.safeParse(dados);
  if (!r.success) {
    const i = r.error.issues[0];
    const chave = i?.path[0] === undefined ? undefined : String(i.path[0]);
    const campo = chave === undefined ? opcoes.campo : (opcoes.campos?.[chave] ?? chave);
    throw new Validacao(i?.message ?? "Dados inválidos.", { campo, regra: i ? regraDoIssue(i) : undefined });
  }
  return r.data;
}
