// Helpers de validação compartilhados pelos serviços financeiros.
import { z } from "zod";
import { parseDataBR } from "@/lib/datas";
import { Validacao } from "@/lib/erros";

export const esquemaId = (msg: string) => z.string({ error: msg }).trim().min(1, msg);
export const esquemaData = z.string({ error: "Data inválida" }).trim().transform((t) => parseDataBR(t));
export const esquemaDataOpcional = z
  .string({ error: "Data inválida" })
  .trim()
  .optional()
  .transform((t) => (t ? parseDataBR(t) : undefined));
export const esquemaTextoOpcional = z
  .string({ error: "Texto inválido" })
  .trim()
  .optional()
  .transform((t) => (t ? t : undefined));
export const esquemaMotivo = z
  .string({ error: "Informe o motivo do cancelamento" })
  .trim()
  .min(1, "Informe o motivo do cancelamento");

export function validar<T>(esquema: z.ZodType<T, unknown>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new Validacao(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}
