"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  /** Texto do campo: "Motivo do cancelamento" ou "Data da baixa". */
  rotuloCampo: string;
  tipoCampo?: "text" | "date";
  valorInicial?: string;
  textoConfirmar: string;
  perigo?: boolean;
  aoConfirmar: (valor: string) => Promise<{ erro?: string }>;
  aoFechar: () => void;
};

/** Diálogo nativo (<dialog>) com um campo e confirmação: usado em "Cancelar" e "Dar baixa". */
export function ModalCampo({ aberto, titulo, descricao, rotuloCampo, tipoCampo = "text", valorInicial = "", textoConfirmar, perigo, aoConfirmar, aoFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const idTitulo = `${uid}-titulo`;
  const idCampo = `${uid}-campo`;
  const idErro = `${uid}-erro`;
  const [valor, setValor] = useState(valorInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setValor(valorInicial);
      setErro(null);
      d.showModal();
    }
    if (!aberto && d.open) d.close();
  }, [aberto, valorInicial]);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await aoConfirmar(valor);
      if (r.erro) setErro(r.erro);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      aria-labelledby={idTitulo}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 shadow-xl backdrop:bg-black/50"
    >
      <h2 id={idTitulo} className="text-lg font-bold text-marca-900">
        {titulo}
      </h2>
      {descricao ? <p className="mt-1 text-sm text-slate-700">{descricao}</p> : null}
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor={idCampo} className="text-sm font-medium text-slate-800">
          {rotuloCampo}
        </label>
        {tipoCampo === "date" ? (
          <input id={idCampo} aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined} type="date" value={valor} onChange={(e) => setValor(e.target.value)} className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK}`} />
        ) : (
          <textarea
            id={idCampo}
            rows={3}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK} py-2`}
          />
        )}
      </div>
      {erro ? (
        <div id={idErro} className="mt-3">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Botao variante={perigo ? "perigo" : "primario"} onClick={confirmar} disabled={enviando} className="flex-1">
          {enviando ? "Salvando…" : textoConfirmar}
        </Botao>
        <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
          Voltar
        </Botao>
      </div>
    </dialog>
  );
}
