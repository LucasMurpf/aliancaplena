"use server";

import { gravarCookieSessao, emitirTokenSessao } from "@/lib/auth";
import { mensagemDeErro, type EstadoForm } from "@/lib/acoes";
import { entrar } from "@/lib/services/autenticacao";

export async function entrarAction(_anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const email = String(dados.get("email") ?? "");
  try {
    const usuario = await entrar(email, String(dados.get("senha") ?? ""));
    await gravarCookieSessao(await emitirTokenSessao(usuario.id));
    return { ok: true };
  } catch (e) {
    return { erro: mensagemDeErro(e), valores: { email } };
  }
}
