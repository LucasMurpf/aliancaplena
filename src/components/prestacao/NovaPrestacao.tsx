"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "@/components/ui/estilos";
import { lerMesEscolhido } from "@/lib/prestacao/ui";

/** Escolha do mês (aaaa-mm, atual ou passado) para ver a prévia e publicar. `hoje` = aaaa-mm-dd em São Paulo. */
export function NovaPrestacao({ hoje, mesAtual, podePublicar }: { hoje: string; mesAtual: string; podePublicar: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(mesAtual);
  const [erro, setErro] = useState<string | null>(null);

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    const m = lerMesEscolhido(valor, new Date(`${hoje}T00:00:00Z`));
    if (!m) {
      setErro("Escolha o mês no formato aaaa-mm (do mês atual ou de um mês passado)");
      return;
    }
    setErro(null);
    router.push(`/relatorios/prestacao/${m.ano}/${m.mes}`);
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="nova-prestacao-mes" className="text-sm font-medium text-slate-800">
          {podePublicar ? "Nova prestação — mês" : "Ver prévia de um mês"}
        </label>
        <input
          id="nova-prestacao-mes"
          type="month"
          max={mesAtual}
          min="2000-01"
          placeholder="aaaa-mm"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "nova-prestacao-erro" : undefined}
          className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK}`}
        />
        {erro ? (
          <p id="nova-prestacao-erro" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}
      </div>
      <Botao type="submit" className="w-full sm:w-auto">
        Ver prévia
      </Botao>
    </form>
  );
}
