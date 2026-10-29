"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alerta } from "@/components/ui/Alerta";
import { Botao } from "@/components/ui/Botao";

type Props = {
  aberto: boolean;
  titulo: string;
  texto: string;
  textoConfirmar: string;
  aoConfirmar: () => Promise<{ erro?: string }>;
  aoFechar: () => void;
};

/** Diálogo nativo de confirmação, sem campo. */
export function ModalConfirmar({ aberto, titulo, texto, textoConfirmar, aoConfirmar, aoFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setErro(null);
      d.showModal();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await aoConfirmar();
      if (r.erro) setErro(r.erro);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <dialog ref={ref} onClose={aoFechar} aria-labelledby={idTitulo} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 shadow-xl backdrop:bg-black/50">
      <h2 id={idTitulo} className="text-lg font-bold text-marca-900">
        {titulo}
      </h2>
      <p className="mt-2 text-base text-slate-800">{texto}</p>
      {erro ? (
        <div className="mt-3">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Botao onClick={confirmar} disabled={enviando} className="flex-1">
          {enviando ? "Publicando…" : textoConfirmar}
        </Botao>
        <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
          Voltar
        </Botao>
      </div>
    </dialog>
  );
}
