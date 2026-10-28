"use client";

import { useState } from "react";
import type { MembroOpcao } from "@/app/(sistema)/lancamentos/actions";
import { SeletorMembro } from "../SeletorMembro";

/** Escolha do membro dentro do formulário (GET) do relatório; sem escolha = todos os membros. */
export function SeletorMembroRelatorio({ inicial }: { inicial: MembroOpcao | null }) {
  const [membro, setMembro] = useState<MembroOpcao | null>(inicial);
  return (
    <div>
      <SeletorMembro id="r-membro" valor={membro} onChange={setMembro} permitirCadastro={false} />
      <input type="hidden" name="membroId" value={membro?.id ?? ""} />
      {membro ? null : <p className="mt-1 text-xs text-slate-600">Em branco: mostra o total de todos os membros.</p>}
    </div>
  );
}
