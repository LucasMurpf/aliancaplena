"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { entregarArquivo } from "@/lib/entregar-arquivo";
import { rastrear } from "@/lib/metricas/cliente";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";

type Props = {
  lancamentoId: string;
  /** "2026/000012" quando já existe recibo; muda o rótulo do botão. */
  numero?: string | null;
  /** Lançamento cancelado: só baixa o recibo já emitido. */
  cancelado?: boolean;
  className?: string;
};

const MSG_FALHA = "Não foi possível gerar o recibo. Tente novamente.";

function nomeDoArquivo(resposta: Response, numero: string | null | undefined): string {
  const cab = resposta.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/i.exec(cab);
  if (m) return m[1];
  return `recibo${numero ? `-${numero.replace("/", "-")}` : ""}.pdf`;
}

/** Gera o recibo no servidor; no celular abre o compartilhamento nativo com o PDF, senão baixa. */
export function BotaoRecibo({ lancamentoId, numero, cancelado = false, className = "" }: Props) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/pdf/recibo/${encodeURIComponent(lancamentoId)}`, { credentials: "same-origin" });
      if (!resposta.ok) {
        const texto = (await resposta.text().catch(() => "")).trim();
        setErro(texto && texto.length <= 200 ? texto : MSG_FALHA);
        return;
      }
      const blob = await resposta.blob();
      const arquivo = new File([blob], nomeDoArquivo(resposta, numero), { type: "application/pdf" });
      const resultado = await entregarArquivo(arquivo, {
        canShare: typeof navigator.canShare === "function" ? (d) => navigator.canShare(d) : undefined,
        share: (d) => navigator.share(d),
        baixar,
      });
      // O recibo já foi emitido, mesmo que o usuário tenha fechado a folha de compartilhamento.
      if (resultado !== "cancelado") rastrear("recibo_emitido", { compartilhado: resultado === "compartilhado" });
      router.refresh(); // mostra o número do recibo recém-emitido
    } catch {
      setErro(MSG_FALHA);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Botao onClick={gerar} disabled={gerando} className="w-full sm:w-auto">
        {gerando ? "Gerando recibo…" : numero ? (cancelado ? `Baixar recibo nº ${numero} (cancelado)` : `Baixar recibo ${numero}`) : "Gerar recibo"}
      </Botao>
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
    </div>
  );
}

function baixar(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
