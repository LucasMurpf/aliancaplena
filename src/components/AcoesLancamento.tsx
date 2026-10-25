"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cancelarLancamentoAction,
  cancelarTransferenciaAction,
  darBaixaAction,
} from "@/app/(sistema)/lancamentos/actions";
import { rastrear } from "@/lib/metricas/cliente";
import { ModalCampo } from "./ModalCampo";
import { Botao } from "./ui/Botao";

type Props = {
  id: string;
  /** Lançamento: PREVISTO/REALIZADO/CANCELADO. */
  status: "PREVISTO" | "REALIZADO" | "CANCELADO";
  hoje: string;
  podeLancar: boolean;
};

function registrarErro(r: { campo?: string; regra?: string; inesperado?: boolean }) {
  if (r.campo || r.regra) rastrear("erro_validacao", { campo: r.campo ?? "geral", regra: r.regra ?? "outra" });
  if (r.inesperado) rastrear("erro_inesperado", { campo: "acao" });
}

export function AcoesLancamento({ id, status, hoje, podeLancar }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "baixa" | "cancelar">(null);
  if (!podeLancar || status === "CANCELADO") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/lancamentos/${id}/editar`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
        >
          Editar
        </Link>
        {status === "PREVISTO" ? <Botao onClick={() => setModal("baixa")}>Dar baixa</Botao> : null}
        <Botao variante="secundario" className="text-red-700" onClick={() => setModal("cancelar")}>
          Cancelar lançamento
        </Botao>
      </div>
      <ModalCampo
        aberto={modal === "baixa"}
        titulo="Dar baixa"
        descricao="Informe em que dia o dinheiro entrou ou saiu."
        rotuloCampo="Data da baixa"
        tipoCampo="date"
        valorInicial={hoje}
        textoConfirmar="Dar baixa"
        aoFechar={() => setModal(null)}
        aoConfirmar={async (data) => {
          const r = await darBaixaAction(id, data);
          if (!r.ok) {
            registrarErro(r);
            return { erro: r.erro };
          }
          setModal(null);
          router.refresh();
          return {};
        }}
      />
      <ModalCampo
        aberto={modal === "cancelar"}
        titulo="Cancelar lançamento"
        descricao="O lançamento sai dos totais, mas continua no histórico."
        rotuloCampo="Motivo do cancelamento"
        textoConfirmar="Cancelar lançamento"
        perigo
        aoFechar={() => setModal(null)}
        aoConfirmar={async (motivo) => {
          const r = await cancelarLancamentoAction(id, motivo);
          if (!r.ok) {
            registrarErro(r);
            return { erro: r.erro };
          }
          setModal(null);
          router.refresh();
          return {};
        }}
      />
    </>
  );
}

/** Cancelar transferência (ativa). */
export function AcoesTransferencia({ id, ativa, podeLancar }: { id: string; ativa: boolean; podeLancar: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  if (!podeLancar || !ativa) return null;
  return (
    <>
      <Botao variante="secundario" className="text-red-700" onClick={() => setAberto(true)}>
        Cancelar transferência
      </Botao>
      <ModalCampo
        aberto={aberto}
        titulo="Cancelar transferência"
        descricao="Os saldos das duas contas voltam ao que eram antes."
        rotuloCampo="Motivo do cancelamento"
        textoConfirmar="Cancelar transferência"
        perigo
        aoFechar={() => setAberto(false)}
        aoConfirmar={async (motivo) => {
          const r = await cancelarTransferenciaAction(id, motivo);
          if (!r.ok) {
            registrarErro(r);
            return { erro: r.erro };
          }
          setAberto(false);
          router.refresh();
          return {};
        }}
      />
    </>
  );
}
