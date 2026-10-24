// Peças de validação Zod compartilhadas entre serviços.
import { z } from "zod";

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
