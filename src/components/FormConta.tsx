"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarContaAction, criarContaAction } from "@/app/(sistema)/configuracoes/contas/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { ROTULO_TIPO_CONTA } from "@/lib/rotulos";
import { CampoDinheiro } from "./CampoDinheiro";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";
import { Selecao } from "./ui/Selecao";

type Props = {
  id?: string;
  inicial?: { nome: string; tipo: "CAIXA" | "BANCO"; saldoInicial: string };
};

const CAMPOS = ["nome", "tipo", "saldoInicial"];

/** Conta da igreja (caixa ou banco). Saldo inicial aceita 0. */
export function FormConta({ id, inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [tipo, setTipo] = useState<"CAIXA" | "BANCO">(inicial?.tipo ?? "CAIXA");
  const [saldoInicial, setSaldoInicial] = useState(inicial?.saldoInicial ?? "");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErros({});
    setErroGeral(null);
    setSalvo(false);
    if (saldoInicial.trim() === "") {
      setErros({ saldoInicial: "Informe o saldo inicial (use 0 se não houver)" });
      return;
    }
    setEnviando(true);
    const dados = { nome, tipo, saldoInicial };
    try {
      if (id) {
        const r = await atualizarContaAction(id, dados);
        if (!r.ok) return falhou(r);
        setSalvo(true);
        router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
      } else {
        const r = await criarContaAction(dados);
        if (!r.ok) return falhou(r);
        router.push(`/configuracoes/contas/${r.id}?salvo=1`);
      }
    } catch {
      setErroGeral("Algo deu errado, tente novamente");
    } finally {
      setEnviando(false);
    }
  }

  function falhou(r: { erro: string; campo?: string; regra?: string; inesperado?: boolean }) {
    registrarErroAcao(r);
    const destino = destinoDoErro(r.campo, CAMPOS);
    if (destino) setErros({ [destino]: r.erro });
    else setErroGeral(r.erro);
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}
      {salvo ? <Alerta tipo="sucesso">Alterações salvas</Alerta> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="conta-nome" className="text-sm font-medium text-slate-800">
          Nome
        </label>
        <input
          id="conta-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="off"
          aria-invalid={erros.nome ? true : undefined}
          aria-describedby={erros.nome ? "conta-nome-erro" : undefined}
          className={`${CLASSE_INPUT} ${erros.nome ? BORDA_ERRO : BORDA_OK}`}
        />
        {erros.nome ? (
          <p id="conta-nome-erro" className="text-sm text-red-700">
            {erros.nome}
          </p>
        ) : null}
      </div>
      <Selecao rotulo="Tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "CAIXA" | "BANCO")} erro={erros.tipo}>
        <option value="CAIXA">{ROTULO_TIPO_CONTA.CAIXA}</option>
        <option value="BANCO">{ROTULO_TIPO_CONTA.BANCO}</option>
      </Selecao>
      <CampoDinheiro id="saldoInicial" rotulo="Saldo inicial" value={saldoInicial} onChange={setSaldoInicial} erro={erros.saldoInicial} />
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar conta"}
        </Botao>
      </div>
    </form>
  );
}
