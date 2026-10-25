"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { anexarArquivoAction } from "@/app/(sistema)/lancamentos/actions";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { UploadAnexos } from "./UploadAnexos";

/** Anexar comprovantes a um lançamento já salvo (também serve para reenviar os que falharam). */
export function AdicionarAnexos({ lancamentoId }: { lancamentoId: string }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    setErros([]);
    const falhas: File[] = [];
    const msgs: string[] = [];
    for (const arquivo of arquivos) {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const r = await anexarArquivoAction(lancamentoId, fd);
      if (!r.ok) {
        falhas.push(arquivo);
        msgs.push(`${arquivo.name}: ${r.erro}`);
      }
    }
    setEnviando(false);
    setArquivos(falhas);
    setErros(msgs);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <UploadAnexos rotulo="" arquivos={arquivos} onChange={setArquivos} />
      {erros.map((m) => (
        <Alerta key={m} tipo="erro">
          {m}
        </Alerta>
      ))}
      {arquivos.length > 0 ? (
        <Botao onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar comprovantes"}
        </Botao>
      ) : null}
    </div>
  );
}
