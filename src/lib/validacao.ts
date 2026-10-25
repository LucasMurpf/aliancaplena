// Peças de validação Zod compartilhadas entre serviços.
import { z } from "zod";
import { Validacao } from "@/lib/erros";

export const MENSAGEM_SENHA = "A senha deve ter entre 8 e 72 caracteres";

// bcrypt ignora o que passa de 72 bytes; por isso o limite é em bytes, não caracteres.
export const esquemaSenha = z
  .string({ error: MENSAGEM_SENHA })
  .refine((s) => s.length >= 8 && Buffer.byteLength(s, "utf8") <= 72, { message: MENSAGEM_SENHA });

export const esquemaEmail = z
  .string({ error: "E-mail inválido" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "E-mail inválido" }));

/**
 * Valida com Zod e lança `Validacao` com o primeiro erro. `campo` é o campo de primeiro nível
 * (ex.: "email"), para a tela mostrar a mensagem junto ao campo; `regra` é o código do Zod.
 */
export function validarComZod<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) {
    const primeiro = r.error.issues[0];
    const campo = primeiro?.path[0];
    throw new Validacao(primeiro?.message ?? "Dados inválidos.", {
      campo: campo === undefined ? undefined : String(campo),
      regra: primeiro?.code,
    });
  }
  return r.data;
}
