"use client";

import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/Campo";
import { Formulario } from "@/components/ui/Formulario";
import { novaSessaoMetricas, rastrear } from "@/lib/metricas/cliente";
import { entrarAction } from "./actions";

export function FormularioLogin() {
  const router = useRouter();
  return (
    <Formulario
      acao={entrarAction}
      textoBotao="Entrar"
      textoEnviando="Entrando…"
      aoSucesso={() => {
        // Novo sessaoId e evento `login` ficam na fila em memória; o envio acontece
        // quando o layout do sistema (que chama iniciarMetricas) assumir, após a navegação.
        novaSessaoMetricas();
        rastrear("login");
        router.replace("/");
        router.refresh();
      }}
    >
      {(estado) => (
        <>
          <Campo rotulo="E-mail" name="email" type="email" autoComplete="username" required defaultValue={estado.valores?.email} />
          <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
        </>
      )}
    </Formulario>
  );
}
