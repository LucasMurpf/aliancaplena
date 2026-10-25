"use client";

import { useState } from "react";
import { urlAnexoAction } from "@/app/(sistema)/lancamentos/actions";

/** Abre o anexo por uma URL assinada pedida na hora (vale poucos minutos). */
export function AnexoLink({ id, nome, detalhe }: { id: string; nome: string; detalhe: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrir() {
    setAbrindo(true);
    setErro(null);
    // Abre a aba já no clique (evita bloqueio de pop-up) e a direciona quando a URL chegar.
    const aba = window.open("", "_blank");
    try {
      const r = await urlAnexoAction(id);
      if (!r.ok) {
        aba?.close();
        setErro(r.erro);
        return;
      }
      if (aba) aba.location.href = r.url;
      else window.location.href = r.url;
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={abrir}
        disabled={abrindo}
        className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 text-left text-sm hover:bg-marca-50"
      >
        <span className="min-w-0 truncate font-medium text-marca-700">{nome}</span>
        <span className="shrink-0 text-xs text-slate-600">{abrindo ? "Abrindo…" : detalhe}</span>
      </button>
      {erro ? <span className="px-1 text-sm text-red-700">{erro}</span> : null}
    </li>
  );
}
