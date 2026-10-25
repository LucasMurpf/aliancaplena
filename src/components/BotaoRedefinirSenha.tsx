"use client";

import { useState } from "react";
import { redefinirSenhaAction } from "@/app/(sistema)/configuracoes/usuarios/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { ModalCampo } from "./ModalCampo";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";

/** Define uma nova senha para o usuário (ele não precisa saber a antiga). */
export function BotaoRedefinirSenha({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {sucesso ? <Alerta tipo="sucesso">Senha redefinida</Alerta> : null}
      <div>
        <Botao variante="secundario" onClick={() => { setSucesso(false); setAberto(true); }}>
          Redefinir senha
        </Botao>
      </div>
      <ModalCampo
        aberto={aberto}
        titulo="Redefinir senha"
        descricao="Informe a nova senha. A senha deve ter entre 8 e 72 caracteres."
        rotuloCampo="Nova senha"
        tipoCampo="senha"
        textoConfirmar="Redefinir senha"
        aoFechar={() => setAberto(false)}
        aoConfirmar={async (senha) => {
          const r = await redefinirSenhaAction(id, senha);
          if (!r.ok) {
            registrarErroAcao(r);
            return { erro: r.erro };
          }
          setAberto(false);
          setSucesso(true);
          return {};
        }}
      />
    </div>
  );
}
