import type { ReactNode, SelectHTMLAttributes } from "react";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./estilos";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; erro?: string; children: ReactNode };

export function Selecao({ rotulo, erro, id, name, className = "", children, ...resto }: Props) {
  const idCampo = id ?? name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <select
        id={idCampo}
        name={name}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK} ${className}`}
        {...resto}
      >
        {children}
      </select>
      {erro ? (
        <p id={`${idCampo}-erro`} className="text-sm text-red-700">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
