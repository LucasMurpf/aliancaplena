import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" };

const VARIANTES = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 disabled:bg-marca-600/60",
  secundario: "bg-white text-marca-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-60",
  perigo: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/60",
} as const;

export function Botao({ variante = "primario", className = "", type = "button", ...resto }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
      {...resto}
    />
  );
}
