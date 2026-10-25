import type { HTMLAttributes } from "react";

export function Cartao({ className = "", ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`} {...resto} />;
}
