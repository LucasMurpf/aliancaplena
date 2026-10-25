import type { ReactNode } from "react";
import { Cartao } from "@/components/ui/Cartao";

/** Moldura das telas públicas (login e instalação). */
export function PainelPublico({ titulo, subtitulo, larga, children }: { titulo: string; subtitulo?: string; larga?: boolean; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-marca-50 px-4 py-10">
      <div className={`w-full ${larga ? "max-w-xl" : "max-w-sm"}`}>
        <div className="mb-6 text-center">
          <div aria-hidden="true" className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-marca-600 text-2xl text-white">
            ⛪
          </div>
          <h1 className="text-2xl font-bold text-marca-900">{titulo}</h1>
          {subtitulo ? <p className="mt-1 text-sm text-slate-600">{subtitulo}</p> : null}
        </div>
        <Cartao>{children}</Cartao>
      </div>
    </main>
  );
}
