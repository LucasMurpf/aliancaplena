"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarBemAction, criarBemAction } from "@/app/(sistema)/patrimonio/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { CampoDinheiro } from "./CampoDinheiro";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  id?: string;
  inicial?: { descricao: string; valor: string; local: string };
};

const CAMPOS = ["descricao", "valor", "local"];

/** Bem do patrimônio: descrição, valor e local. */
export function FormBem({ id, inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [valor, setValor] = useState(inicial?.valor ?? "");
  const [local, setLocal] = useState(inicial?.local ?? "");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function falhou(r: { erro: string; campo?: string; regra?: string; inesperado?: boolean }) {
    registrarErroAcao(r);
    const destino = destinoDoErro(r.campo, CAMPOS);
    if (destino) setErros({ [destino]: r.erro });
    else setErroGeral(r.erro);
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErros({});
    setErroGeral(null);
    setSalvo(false);
    setEnviando(true);
    const dados = { descricao, valor, local };
    try {
      if (id) {
        const r = await atualizarBemAction(id, dados);
        if (!r.ok) return falhou(r);
        setSalvo(true);
        router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
      } else {
        const r = await criarBemAction(dados);
        if (!r.ok) return falhou(r);
        router.push(`/patrimonio/${r.id}?salvo=1`);
      }
    } catch {
      setErroGeral("Algo deu errado, tente novamente");
    } finally {
      setEnviando(false);
    }
  }

  const texto = (campo: "descricao" | "local", rotulo: string, value: string, onChange: (v: string) => void, dica: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`bem-${campo}`} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <input
        id={`bem-${campo}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={dica}
        autoComplete="off"
        aria-invalid={erros[campo] ? true : undefined}
        aria-describedby={erros[campo] ? `bem-${campo}-erro` : undefined}
        className={`${CLASSE_INPUT} ${erros[campo] ? BORDA_ERRO : BORDA_OK}`}
      />
      {erros[campo] ? (
        <p id={`bem-${campo}-erro`} className="text-sm text-red-700">
          {erros[campo]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}
      {salvo ? <Alerta tipo="sucesso">Alterações salvas</Alerta> : null}
      {texto("descricao", "Descrição", descricao, setDescricao, "Ex.: Caixa de som")}
      <CampoDinheiro id="valor" rotulo="Valor" value={valor} onChange={setValor} erro={erros.valor} />
      {texto("local", "Local", local, setLocal, "Ex.: Templo")}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar bem"}
        </Botao>
      </div>
    </form>
  );
}
