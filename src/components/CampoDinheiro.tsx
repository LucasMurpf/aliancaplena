"use client";

import type { Ref } from "react";
import { normalizarValorDigitado } from "@/lib/form-lancamento";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  value: string;
  onChange: (valor: string) => void;
  rotulo?: string;
  erro?: string;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
};

/** Valor em reais: teclado numérico do celular; aceita "12,50" ou "12.50". */
export function CampoDinheiro({ value, onChange, rotulo = "Valor", erro, id = "valor", inputRef }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-slate-500">
          R$
        </span>
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          onChange={(e) => onChange(normalizarValorDigitado(e.target.value))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK} min-h-14 pl-11 text-2xl font-semibold tabular-nums`}
        />
      </div>
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-red-700">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
