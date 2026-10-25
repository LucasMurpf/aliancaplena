"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ResultadoAcao } from "@/lib/acoes";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";

type Props = {
  id: string;
  ativo: boolean;
  /** Server Action que liga/desliga (ex.: definirContaAtivaAction). */
  alternar: (id: string, ativo: boolean) => Promise<ResultadoAcao>;
};

/** Inativar/Ativar. Inativo sai dos formulários de lançamento, mas segue no histórico. */
export function BotaoAtivo({ id, ativo, alternar }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoClicar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await alternar(id, !ativo);
      if (!r.ok) {
        registrarErroAcao(r);
        setErro(r.erro);
        return;
      }
      router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
    } catch {
      setErro("Algo deu errado, tente novamente");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
      <div>
        <Botao variante="secundario" className={ativo ? "text-red-700" : "text-marca-900"} onClick={aoClicar} disabled={enviando}>
          {enviando ? "Salvando…" : ativo ? "Inativar" : "Ativar"}
        </Botao>
      </div>
    </div>
  );
}
