import type { ReactNode } from "react";

type Props = { tipo?: "erro" | "info" | "sucesso"; children: ReactNode };

const ESTILOS = {
  erro: "border-red-300 bg-red-50 text-red-900",
  info: "border-amber-300 bg-amber-50 text-amber-900",
  sucesso: "border-emerald-300 bg-emerald-50 text-emerald-900",
} as const;

export function Alerta({ tipo = "info", children }: Props) {
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${ESTILOS[tipo]}`}>
      {children}
    </div>
  );
}
