"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { criarTransferenciaAction } from "@/app/(sistema)/lancamentos/actions";
import { rastrear } from "@/lib/metricas/cliente";
import { CampoData } from "./CampoData";
import { CampoDinheiro } from "./CampoDinheiro";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_OK, CLASSE_INPUT } from "./ui/estilos";
import { Selecao } from "./ui/Selecao";

type Props = { contas: { id: string; nome: string }[]; hoje: string };

const CAMPO_TELA: Record<string, string> = { dataVencimento: "data" };

/** Move dinheiro entre duas contas da igreja. Não conta como entrada nem saída. */
export function FormTransferencia({ contas, hoje }: Props) {
  const router = useRouter();
  const [origem, setOrigem] = useState(contas[0]?.id ?? "");
  const [destino, setDestino] = useState(contas[1]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    try {
      const r = await criarTransferenciaAction({ contaOrigemId: origem, contaDestinoId: destino, valor, data, descricao });
      if (!r.ok) {
        if (r.campo || r.regra) rastrear("erro_validacao", { campo: r.campo ?? "geral", regra: r.regra ?? "outra" });
        if (r.inesperado) rastrear("erro_inesperado", { campo: "transferencia" });
        if (r.campo) setErros({ [CAMPO_TELA[r.campo] ?? r.campo]: r.erro });
        else setErroGeral(r.erro);
        return;
      }
      router.push(`/transferencias/${r.id}?salvo=1`);
    } catch {
      setErroGeral("Algo deu errado, tente novamente");
    } finally {
      setEnviando(false);
    }
  }

  if (contas.length < 2) {
    return <Alerta tipo="info">Para transferir é preciso ter pelo menos duas contas ativas.</Alerta>;
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}
      <Selecao rotulo="Sai da conta" name="contaOrigem" value={origem} onChange={(e) => setOrigem(e.target.value)} erro={erros.contaOrigem}>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Entra na conta" name="contaDestino" value={destino} onChange={(e) => setDestino(e.target.value)} erro={erros.contaDestino}>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      <CampoDinheiro value={valor} onChange={setValor} erro={erros.valor} />
      <CampoData rotulo="Data" value={data} onChange={setData} erro={erros.data} />
      <div className="flex flex-col gap-1">
        <label htmlFor="descricao" className="text-sm font-medium text-slate-800">
          Descrição (opcional)
        </label>
        <input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} autoComplete="off" className={`${CLASSE_INPUT} ${BORDA_OK}`} />
      </div>
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : "Transferir"}
        </Botao>
      </div>
    </form>
  );
}
