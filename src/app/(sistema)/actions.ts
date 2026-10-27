"use server";

import { redirect } from "next/navigation";
import { apagarCookieSessao, emitirTokenSessao, gravarCookieSessao, obterUsuarioAtual } from "@/lib/auth";
import { mensagemDeErro, type EstadoForm } from "@/lib/acoes";

/** Reemite o cookie de sessão com novo prazo (botão Continuar e atividade do usuário). */
export async function renovarSessao(): Promise<EstadoForm> {
  try {
    const usuario = await obterUsuarioAtual();
    if (!usuario) return { erro: "Sessão expirada" };
    await gravarCookieSessao(await emitirTokenSessao(usuario.id));
    return { ok: true };
  } catch (e) {
    return { erro: mensagemDeErro(e) };
  }
}

/** Apaga a sessão (usado pelo logout por inatividade; o cliente navega depois). */
export async function sair(): Promise<EstadoForm> {
  await apagarCookieSessao();
  return { ok: true };
}

/** Botão "Sair" do menu. */
export async function sairEIrParaLogin(): Promise<void> {
  await apagarCookieSessao();
  redirect("/login");
}
