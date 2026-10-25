"use server";

import { gravarCookieSessao, criarTokenSessao } from "@/lib/auth";
import { mensagemDeErro, type EstadoForm } from "@/lib/acoes";
import { instalar } from "@/lib/services/instalacao";

export async function instalarAction(_anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const texto = (campo: string) => String(dados.get(campo) ?? "");
  try {
    const usuario = await instalar({
      nomeIgreja: texto("nomeIgreja"),
      logoUrl: texto("logoUrl") || undefined,
      nomeConta: texto("nomeConta"),
      tipoConta: texto("tipoConta") === "BANCO" ? "BANCO" : "CAIXA",
      saldoInicial: texto("saldoInicial"),
      adminNome: texto("adminNome"),
      adminEmail: texto("adminEmail"),
      adminSenha: texto("adminSenha"),
    });
    await gravarCookieSessao(await criarTokenSessao(usuario.id));
    return { ok: true };
  } catch (e) {
    const { adminSenha: _senha, ...valores } = Object.fromEntries(
      [...dados.entries()].filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
    return { erro: mensagemDeErro(e), valores };
  }
}
