import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: ReactNode };

export function Campo({ rotulo, ajuda, id, name, className = "", ...resto }: Props) {
  const idCampo = id ?? name;
  const idAjuda = ajuda ? `${idCampo}-ajuda` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <input
        id={idCampo}
        name={name}
        aria-describedby={idAjuda}
        className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus-visible:border-marca-600 focus-visible:outline-2 focus-visible:outline-marca-600 ${className}`}
        {...resto}
      />
      {ajuda ? (
        <p id={idAjuda} className="text-xs text-slate-600">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}
