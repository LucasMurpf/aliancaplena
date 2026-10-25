"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { anexarArquivoAction } from "@/app/(sistema)/lancamentos/actions";
import { enviarAnexos } from "@/lib/form-lancamento";
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
    try {
      const falhas = await enviarAnexos(arquivos, (arquivo) => {
        const fd = new FormData();
        fd.append("arquivo", arquivo);
        return anexarArquivoAction(lancamentoId, fd);
      });
      setArquivos(arquivos.filter((a) => falhas.includes(a.name)));
      setErros(falhas.map((n) => `${n}: não foi possível enviar. Confira o tipo (foto ou PDF), o tamanho (até 10 MB) e a conexão.`));
      router.refresh();
    } finally {
      setEnviando(false);
    }
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
