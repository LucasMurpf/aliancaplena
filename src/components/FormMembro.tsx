"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarMembroAction, criarMembroAction } from "@/app/(sistema)/membros/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { CampoData } from "./CampoData";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  /** Sem id: cadastro novo (volta para o detalhe do membro criado). Com id: edição no lugar. */
  id?: string;
  inicial?: { nome: string; telefone: string; dataNascimento: string };
};

const CAMPOS = ["nome", "telefone", "dataNascimento"];

export function FormMembro({ id, inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [dataNascimento, setDataNascimento] = useState(inicial?.dataNascimento ?? "");
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
    const dados = { nome, telefone: telefone.trim() || null, dataNascimento: dataNascimento || null };
    try {
      if (id) {
        const r = await atualizarMembroAction(id, dados);
        if (!r.ok) return falhou(r);
        setSalvo(true);
        router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
      } else {
        const r = await criarMembroAction(dados);
        if (!r.ok) return falhou(r);
        router.push(`/membros/${r.id}?salvo=1`);
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

  const classe = (c: string) => `${CLASSE_INPUT} ${erros[c] ? BORDA_ERRO : BORDA_OK}`;

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}
      {salvo ? <Alerta tipo="sucesso">Alterações salvas</Alerta> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="membro-nome" className="text-sm font-medium text-slate-800">
          Nome
        </label>
        <input
          id="membro-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="off"
          aria-invalid={erros.nome ? true : undefined}
          aria-describedby={erros.nome ? "membro-nome-erro" : undefined}
          className={classe("nome")}
        />
        {erros.nome ? (
          <p id="membro-nome-erro" className="text-sm text-red-700">
            {erros.nome}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="membro-telefone" className="text-sm font-medium text-slate-800">
          Telefone (opcional)
        </label>
        <input
          id="membro-telefone"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          autoComplete="off"
          aria-invalid={erros.telefone ? true : undefined}
          aria-describedby={erros.telefone ? "membro-telefone-erro" : undefined}
          className={classe("telefone")}
        />
        {erros.telefone ? (
          <p id="membro-telefone-erro" className="text-sm text-red-700">
            {erros.telefone}
          </p>
        ) : null}
      </div>
      <CampoData id="membro-nascimento" rotulo="Data de nascimento (opcional)" value={dataNascimento} onChange={setDataNascimento} erro={erros.dataNascimento} />
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar membro"}
        </Botao>
      </div>
    </form>
  );
}
