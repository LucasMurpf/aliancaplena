"use client";

// Formulário padrão: liga uma Server Action (`{ erro?, ok? }`), mostra a mensagem de erro
// vinda da action (ErroApp.message) e chama `aoSucesso` quando ela devolve ok.
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { EstadoForm } from "@/lib/acoes";
import { Alerta } from "./Alerta";
import { Botao } from "./Botao";

type Props = {
  acao: (anterior: EstadoForm, dados: FormData) => Promise<EstadoForm>;
  textoBotao: string;
  textoEnviando?: string;
  aoSucesso?: () => void;
  children: ReactNode | ((estado: EstadoForm) => ReactNode);
};

export function Formulario({ acao, textoBotao, textoEnviando = "Enviando…", aoSucesso, children }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {} as EstadoForm);
  const callback = useRef(aoSucesso);
  useEffect(() => {
    callback.current = aoSucesso;
  });
  useEffect(() => {
    if (estado.ok) callback.current?.();
  }, [estado]);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.erro ? <Alerta tipo="erro">{estado.erro}</Alerta> : null}
      {typeof children === "function" ? children(estado) : children}
      <Botao type="submit" disabled={pendente || estado.ok === true} className="w-full">
        {pendente || estado.ok ? textoEnviando : textoBotao}
      </Botao>
    </form>
  );
}
