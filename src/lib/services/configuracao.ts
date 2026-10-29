// Configuração da igreja (linha única criada na instalação). A leitura pública (cabeçalho e login)
// não traz CNPJ nem métricas; a tela de Dados da igreja usa `obterConfiguracaoAdmin`.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import { NaoEncontrado } from "@/lib/erros";
import { registrarLog } from "@/lib/log";
import { validarComZod } from "@/lib/validacao";

export type ConfiguracaoPublica = { nomeIgreja: string; logoUrl: string | null };

export type ConfiguracaoAdmin = ConfiguracaoPublica & { id: string; cnpj: string | null; cidade: string | null; metricasAtivas: boolean };

export type DadosConfiguracao = {
  nomeIgreja: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  metricasAtivas?: boolean;
};

const MSG_LOGO = "Informe um endereço que comece com http:// ou https://, ou deixe em branco";
const MSG_NAO_ENCONTRADA = "Configuração não encontrada";

export async function obterConfiguracao(): Promise<ConfiguracaoPublica | null> {
  const c = await prisma.configuracao.findFirst({
    orderBy: { criadoEm: "asc" },
    select: { nomeIgreja: true, logoUrl: true },
  });
  return c;
}

/** Dados completos para a tela de Dados da igreja (Admin). */
export async function obterConfiguracaoAdmin(ator: UsuarioAtual | null): Promise<ConfiguracaoAdmin> {
  exigir(ator, "admin");
  const c = await prisma.configuracao.findFirst({ orderBy: { criadoEm: "asc" } });
  if (!c) throw new NaoEncontrado(MSG_NAO_ENCONTRADA);
  return { id: c.id, nomeIgreja: c.nomeIgreja, logoUrl: c.logoUrl, cnpj: c.cnpj, cidade: c.cidade, metricasAtivas: c.metricasAtivas };
}

function ehUrlHttp(texto: string): boolean {
  try {
    const u = new URL(texto);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const esquemaAtualizar = z.object({
  nomeIgreja: z
    .string({ error: "Informe o nome da igreja" })
    .trim()
    .min(1, "Informe o nome da igreja"),
  logoUrl: z
    .string({ error: MSG_LOGO })
    .trim()
    .refine((t) => t === "" || ehUrlHttp(t), { message: MSG_LOGO })
    .transform((t) => (t === "" ? null : t))
    .optional(),
  cnpj: z
    .string({ error: "CNPJ inválido" })
    .trim()
    .max(18, "O CNPJ deve ter no máximo 18 caracteres")
    .transform((t) => (t === "" ? null : t))
    .optional(),
  cidade: z
    .string({ error: "Cidade inválida" })
    .trim()
    .max(80, "A cidade deve ter no máximo 80 caracteres")
    .transform((t) => (t === "" ? null : t))
    .optional(),
  metricasAtivas: z.boolean({ error: "Valor inválido" }).optional(),
});

const simNao = (b: boolean) => (b ? "Sim" : "Não");

// Campos comparados para o log: o que muda aparece como um registro ALTEROU por campo.
const textoConfiguracao = (c: { nomeIgreja: string; logoUrl: string | null; cnpj: string | null; cidade: string | null; metricasAtivas: boolean }) => ({
  nomeIgreja: c.nomeIgreja as string | null,
  logoUrl: c.logoUrl,
  cnpj: c.cnpj,
  cidade: c.cidade,
  metricasAtivas: simNao(c.metricasAtivas),
});

/** Só o Admin altera. Cada campo que muda vira um registro de log, na mesma transação. */
export async function atualizarConfiguracao(ator: UsuarioAtual | null, d: DadosConfiguracao): Promise<void> {
  const quem = exigir(ator, "admin");
  const v = validarComZod(esquemaAtualizar, d);
  await prisma.$transaction(async (tx) => {
    const atual = await tx.configuracao.findFirst({ orderBy: { criadoEm: "asc" } });
    if (!atual) throw new NaoEncontrado(MSG_NAO_ENCONTRADA);
    const novo = {
      nomeIgreja: v.nomeIgreja,
      logoUrl: v.logoUrl === undefined ? atual.logoUrl : v.logoUrl,
      cnpj: v.cnpj === undefined ? atual.cnpj : v.cnpj,
      cidade: v.cidade === undefined ? atual.cidade : v.cidade,
      metricasAtivas: v.metricasAtivas ?? atual.metricasAtivas,
    };
    const antes = textoConfiguracao(atual);
    const depois = textoConfiguracao(novo);
    const mudancas = (Object.keys(depois) as (keyof typeof depois)[]).filter((k) => antes[k] !== depois[k]);
    if (mudancas.length === 0) return;
    await tx.configuracao.update({ where: { id: atual.id }, data: novo });
    for (const campo of mudancas) {
      await registrarLog(tx, {
        usuarioId: quem.id,
        entidade: "Configuracao",
        entidadeId: atual.id,
        acao: "ALTEROU",
        campo,
        valorAnterior: antes[campo] ?? undefined,
        valorNovo: depois[campo] ?? undefined,
      });
    }
  });
}
