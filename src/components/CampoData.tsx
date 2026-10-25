"use client";

import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = { value: string; onChange: (v: string) => void; rotulo: string; erro?: string; id?: string };

/** Calendário nativo do aparelho; o valor é sempre aaaa-mm-dd. */
export function CampoData({ value, onChange, rotulo, erro, id = "data" }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK}`}
      />
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-red-700">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
