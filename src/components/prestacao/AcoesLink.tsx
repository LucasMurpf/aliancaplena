"use client";

import { useState } from "react";
import { entregarLink, urlPublicaPrestacao } from "@/lib/prestacao/ui";
import { Botao } from "@/components/ui/Botao";

const classeLink =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600";

async function copiarTexto(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sem permissão da área de transferência (ex.: http): seleciona e copia pelo método antigo.
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    campo.remove();
    if (!ok) throw new Error("copiar");
  }
}

type Props = {
  token: string;
  /** Título do compartilhamento, ex.: "Prestação de contas — outubro de 2026". */
  titulo: string;
  /** Ação extra (ex.: Retirar) no fim da fila. */
  extra?: React.ReactNode;
  className?: string;
};

/** Copiar link, Compartilhar, Abrir e Baixar PDF de uma versão publicada. */
export function AcoesLink({ token, titulo, extra, className = "" }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const caminhoPdf = `/api/pdf/prestacao/${token}`;
  const url = () => urlPublicaPrestacao(window.location.origin, token);

  async function copiar() {
    try {
      await copiarTexto(url());
      setAviso("Link copiado");
    } catch {
      setAviso("Não foi possível copiar. Use Abrir e copie o endereço do navegador.");
    }
  }

  async function compartilhar() {
    try {
      const r = await entregarLink(url(), titulo, {
        share: typeof navigator.share === "function" ? (d) => navigator.share(d) : undefined,
        copiar: copiarTexto,
      });
      if (r === "copiado") setAviso("Link copiado");
      else setAviso(null);
    } catch {
      setAviso("Não foi possível compartilhar. Use Copiar link.");
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={copiar}>
          Copiar link
        </Botao>
        <Botao variante="secundario" onClick={compartilhar}>
          Compartilhar
        </Botao>
        {/* <a> comum, em nova aba: abrir conta uma visualização como qualquer membro. */}
        <a href={`/p/${token}`} target="_blank" rel="noopener noreferrer" className={classeLink}>
          Abrir
        </a>
        <a href={caminhoPdf} className={classeLink}>
          Baixar PDF
        </a>
        {extra}
      </div>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm text-emerald-800">
        {aviso}
      </p>
    </div>
  );
}
