"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publicarPrestacaoAction } from "@/app/(sistema)/relatorios/prestacao/actions";
import { Alerta } from "@/components/ui/Alerta";
import { Botao } from "@/components/ui/Botao";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { rotuloMesExtenso, textoConfirmarPublicacao } from "@/lib/prestacao/ui";
import { AcoesLink } from "./AcoesLink";
import { ModalConfirmar } from "./ModalConfirmar";

type Publicada = { token: string; versao: number };

/** Botão Publicar (com confirmação). Depois de publicar, mostra o link com Copiar e Compartilhar. */
export function PublicarPrestacao({ ano, mes }: { ano: number; mes: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [publicada, setPublicada] = useState<Publicada | null>(null);

  async function publicar(): Promise<{ erro?: string }> {
    const r = await publicarPrestacaoAction(ano, mes);
    if (!r.ok) {
      registrarErroAcao(r);
      return { erro: r.erro };
    }
    setPublicada({ token: r.token, versao: r.versao });
    setAberto(false);
    router.refresh();
    return {};
  }

  return (
    <div className="space-y-3">
      {publicada ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-300">
          <Alerta tipo="sucesso">
            Prestação publicada (versão {publicada.versao}). Envie o link aos membros.
          </Alerta>
          <p className="break-all text-sm text-slate-800" data-testid="link-publicado">
            {`${typeof window === "undefined" ? "" : window.location.origin}/p/${publicada.token}`}
          </p>
          <AcoesLink token={publicada.token} titulo={`Prestação de contas — ${rotuloMesExtenso(ano, mes)}`} />
        </div>
      ) : null}
      <Botao onClick={() => setAberto(true)} className="w-full sm:w-auto">
        {publicada ? "Publicar nova versão" : "Publicar"}
      </Botao>
      <ModalConfirmar
        aberto={aberto}
        titulo="Publicar prestação de contas"
        texto={textoConfirmarPublicacao(ano, mes)}
        textoConfirmar="Publicar"
        aoConfirmar={publicar}
        aoFechar={() => setAberto(false)}
      />
    </div>
  );
}
