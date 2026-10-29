"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { despublicarPrestacaoAction } from "@/app/(sistema)/relatorios/prestacao/actions";
import { Botao } from "@/components/ui/Botao";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { ModalCampo } from "../ModalCampo";
import { AcoesLink } from "./AcoesLink";

/** Só textos e números: nada de Date nem de tipos do Prisma atravessa para o cliente. */
export type ItemPrestacao = {
  id: string;
  token: string;
  /** "outubro de 2026" */
  mes: string;
  versao: number;
  publicadaPor: string;
  /** dd/mm/aaaa */
  publicadaEm: string;
  visualizacoes: number;
  retirada: boolean;
  /** dd/mm/aaaa, quando retirada. */
  retiradaEm: string | null;
};

type Props = { itens: ItemPrestacao[]; podeRetirar: boolean };

function Estado({ i }: { i: ItemPrestacao }) {
  return i.retirada ? (
    <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-sm font-semibold text-slate-800">Retirada{i.retiradaEm ? ` em ${i.retiradaEm}` : ""}</span>
  ) : (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-900">Publicada</span>
  );
}

export function ListaPrestacoes({ itens, podeRetirar }: Props) {
  const router = useRouter();
  const [retirando, setRetirando] = useState<ItemPrestacao | null>(null);

  const acoes = (i: ItemPrestacao) =>
    i.retirada ? null : (
      <AcoesLink
        token={i.token}
        titulo={`Prestação de contas — ${i.mes}`}
        extra={
          podeRetirar ? (
            <Botao variante="perigo" onClick={() => setRetirando(i)}>
              Retirar
            </Botao>
          ) : null
        }
      />
    );

  if (itens.length === 0) {
    return <p className="rounded-2xl bg-white p-5 text-base text-slate-700 shadow-sm ring-1 ring-slate-200">Nenhuma prestação publicada ainda. Escolha um mês acima para começar.</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden" aria-label="Prestações publicadas">
        {itens.map((i) => (
          <li key={i.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-base font-semibold first-letter:uppercase text-slate-900">
                {i.mes} · v{i.versao}
              </p>
              <Estado i={i} />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              Publicada por {i.publicadaPor} em {i.publicadaEm}
            </p>
            <p className="text-sm text-slate-700">
              {i.visualizacoes} {i.visualizacoes === 1 ? "visualização" : "visualizações"}
            </p>
            {acoes(i) ? <div className="mt-2">{acoes(i)}</div> : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Prestações publicadas</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Mês</th>
              <th scope="col" className="px-4 py-3 font-semibold">Versão</th>
              <th scope="col" className="px-4 py-3 font-semibold">Publicada por / em</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Visualizações</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {itens.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium first-letter:uppercase text-slate-900">{i.mes}</td>
                <td className="px-4 py-3 tabular-nums">v{i.versao}</td>
                <td className="px-4 py-3">
                  {i.publicadaPor}
                  <span className="block text-slate-600">{i.publicadaEm}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{i.visualizacoes}</td>
                <td className="px-4 py-3">
                  <Estado i={i} />
                </td>
                <td className="px-4 py-3">{acoes(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalCampo
        aberto={retirando !== null}
        titulo="Retirar prestação"
        descricao={retirando ? `O link da versão ${retirando.versao} de ${retirando.mes} passa a mostrar “Esta prestação foi retirada pela igreja”. Nada é apagado.` : undefined}
        rotuloCampo="Motivo da retirada"
        textoConfirmar="Retirar"
        perigo
        aoConfirmar={async (motivo) => {
          if (!retirando) return {};
          const r = await despublicarPrestacaoAction(retirando.id, motivo);
          if (!r.ok) {
            registrarErroAcao(r);
            return { erro: r.erro };
          }
          setRetirando(null);
          router.refresh();
          return {};
        }}
        aoFechar={() => setRetirando(null)}
      />
    </>
  );
}
