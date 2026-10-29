"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarCategoriaAction, criarCategoriaAction } from "@/app/(sistema)/configuracoes/categorias/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { ROTULO_TIPO_MOVIMENTO } from "@/lib/rotulos";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";
import { Selecao } from "./ui/Selecao";

type Props = {
  id?: string;
  inicial?: { nome: string; tipo: "ENTRADA" | "SAIDA"; nominal: boolean; detalharPublico?: boolean };
};

const CAMPOS = ["nome", "tipo"];

/** O tipo (entrada ou saída) só se escolhe na criação: na edição aparece apenas como leitura. */
export function FormCategoria({ id, inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">(inicial?.tipo ?? "ENTRADA");
  const [nominal, setNominal] = useState(inicial?.nominal ?? false);
  const [detalharPublico, setDetalharPublico] = useState(inicial?.detalharPublico ?? false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    setSalvo(false);
    try {
      if (id) {
        const r = await atualizarCategoriaAction(id, { nome, nominal, ...(tipo === "SAIDA" ? { detalharPublico } : {}) });
        if (!r.ok) return falhou(r);
        setSalvo(true);
        router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
      } else {
        const r = await criarCategoriaAction({ nome, tipo, nominal, detalharPublico: tipo === "SAIDA" && detalharPublico });
        if (!r.ok) return falhou(r);
        router.push(`/configuracoes/categorias/${r.id}?salvo=1`);
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
        <label htmlFor="categoria-nome" className="text-sm font-medium text-slate-800">
          Nome
        </label>
        <input
          id="categoria-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="off"
          aria-invalid={erros.nome ? true : undefined}
          aria-describedby={erros.nome ? "categoria-nome-erro" : undefined}
          className={`${CLASSE_INPUT} ${erros.nome ? BORDA_ERRO : BORDA_OK}`}
        />
        {erros.nome ? (
          <p id="categoria-nome-erro" className="text-sm text-red-700">
            {erros.nome}
          </p>
        ) : null}
      </div>
      {id ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-800">Tipo</span>
          <p className="min-h-11 py-2.5 text-base text-slate-900">{ROTULO_TIPO_MOVIMENTO[inicial?.tipo ?? "ENTRADA"]}</p>
          <p className="text-xs text-slate-600">O tipo não pode ser alterado depois de criado.</p>
        </div>
      ) : (
        <Selecao rotulo="Tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "ENTRADA" | "SAIDA")} erro={erros.tipo}>
          <option value="ENTRADA">{ROTULO_TIPO_MOVIMENTO.ENTRADA}</option>
          <option value="SAIDA">{ROTULO_TIPO_MOVIMENTO.SAIDA}</option>
        </Selecao>
      )}
      <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
        <input type="checkbox" checked={nominal} onChange={(e) => setNominal(e.target.checked)} className="size-5 accent-marca-600" />
        Exige membro (ex.: Dízimo)
      </label>
      {tipo === "SAIDA" ? (
        <label className="flex min-h-11 items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={detalharPublico} onChange={(e) => setDetalharPublico(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-marca-600" />
          <span>
            Mostrar gastos detalhados na prestação pública
            <span className="block text-xs text-slate-600">Cada gasto desta categoria aparece com data, descrição e valor.</span>
          </span>
        </label>
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar categoria"}
        </Botao>
      </div>
    </form>
  );
}
