// Instalação inicial: cria configuração, primeira conta, usuário ADMIN e categorias.
import { Prisma, type TipoConta } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { carregarUsuario, hashSenha, type UsuarioAtual } from "@/lib/auth";
import { parseValorBR } from "@/lib/dinheiro";
import { RegraDeNegocio, Validacao } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { semearCategorias } from "../../../prisma/seed";

// Chave do advisory lock que serializa instalações concorrentes.
const LOCK_INSTALACAO = 4242;

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

const esquemaInstalacao = z.object({
  nomeIgreja: z.string({ error: "Informe o nome da igreja" }).trim().min(1, "Informe o nome da igreja"),
  logoUrl: z.string().trim().optional(),
  nomeConta: z.string({ error: "Informe o nome da conta" }).trim().min(1, "Informe o nome da conta"),
  tipoConta: z.enum(["CAIXA", "BANCO"], { error: "Tipo de conta inválido" }),
  saldoInicial: z.string({ error: "Valor inválido" }),
  adminNome: z.string({ error: "Informe o nome do administrador" }).trim().min(1, "Informe o nome do administrador"),
  adminEmail: esquemaEmail,
  adminSenha: esquemaSenha,
});

export type DadosInstalacao = {
  nomeIgreja: string;
  logoUrl?: string;
  nomeConta: string;
  tipoConta: TipoConta;
  saldoInicial: string;
  adminNome: string;
  adminEmail: string;
  adminSenha: string;
};

// Saldo inicial pode ser zero (parseValorBR rejeita zero; ele continua cuidando do resto).
const PADRAO_ZERO = /^\s*(?:R\$\s*)?0+(?:,0{1,2})?\s*$/;
function parseSaldoInicial(texto: string): Prisma.Decimal {
  if (texto.trim() === "" || PADRAO_ZERO.test(texto)) return new Prisma.Decimal(0);
  return parseValorBR(texto);
}

/** Instalado = existe ao menos um usuário. */
export async function sistemaInstalado(): Promise<boolean> {
  return (await prisma.usuario.count()) > 0;
}

export async function instalar(d: DadosInstalacao): Promise<UsuarioAtual> {
  const r = esquemaInstalacao.safeParse(d);
  if (!r.success) throw new Validacao(r.error.issues[0]?.message ?? "Dados inválidos.");
  const v = r.data;
  const saldoInicial = parseSaldoInicial(v.saldoInicial);

  // Hash fora da transação: bcrypt é lento e não deve segurar o lock.
  const senhaHash = await hashSenha(v.adminSenha);

  const usuarioId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_INSTALACAO})`;
    // Rechecagem depois do lock: outra instalação pode ter terminado enquanto esperávamos.
    if ((await tx.usuario.count()) > 0) throw new RegraDeNegocio("Sistema já instalado");

    const config = await tx.configuracao.create({
      data: { nomeIgreja: v.nomeIgreja, logoUrl: v.logoUrl || null },
    });
    await tx.conta.create({ data: { nome: v.nomeConta, tipo: v.tipoConta, saldoInicial } });
    const usuario = await tx.usuario.create({
      data: {
        nome: v.adminNome,
        email: v.adminEmail,
        senhaHash,
        papeis: { create: [{ papel: "ADMIN" }] },
      },
    });
    await semearCategorias(tx);
    await registrarLog(tx, {
      usuarioId: usuario.id,
      entidade: "Configuracao",
      entidadeId: config.id,
      acao: "INSTALOU",
      valorNovo: v.nomeIgreja,
    });
    return usuario.id;
  });

  const atual = await carregarUsuario(usuarioId);
  if (!atual) throw new Error("Usuário recém-criado não encontrado");
  return atual;
}
