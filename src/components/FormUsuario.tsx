"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarUsuarioAction, criarUsuarioAction } from "@/app/(sistema)/configuracoes/usuarios/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { PAPEIS_ORDEM, ROTULO_PAPEL } from "@/lib/rotulos";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Papel = (typeof PAPEIS_ORDEM)[number];

type Props = {
  /** Sem id: cadastro de usuário novo (com senha inicial). Com id: edição de nome, e-mail e papéis. */
  id?: string;
  inicial?: { nome: string; email: string; papeis: Papel[] };
};

const CAMPOS = ["nome", "email", "senha", "papeis"];

export function FormUsuario({ id, inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [senha, setSenha] = useState("");
  const [papeis, setPapeis] = useState<Papel[]>(inicial?.papeis ?? []);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const alternarPapel = (p: Papel) => setPapeis((atual) => (atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p]));

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    setSalvo(false);
    try {
      if (id) {
        const r = await atualizarUsuarioAction(id, { nome, email, papeis });
        if (!r.ok) return falhou(r);
        setSalvo(true);
        router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
      } else {
        const r = await criarUsuarioAction({ nome, email, senha, papeis });
        if (!r.ok) return falhou(r);
        router.push(`/configuracoes/usuarios/${r.id}?salvo=1`);
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
        <label htmlFor="usuario-nome" className="text-sm font-medium text-slate-800">
          Nome
        </label>
        <input id="usuario-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" aria-invalid={erros.nome ? true : undefined} aria-describedby={erros.nome ? "usuario-nome-erro" : undefined} className={classe("nome")} />
        {erros.nome ? (
          <p id="usuario-nome-erro" className="text-sm text-red-700">
            {erros.nome}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="usuario-email" className="text-sm font-medium text-slate-800">
          E-mail
        </label>
        <input id="usuario-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={erros.email ? true : undefined} aria-describedby={erros.email ? "usuario-email-erro" : undefined} className={classe("email")} />
        {erros.email ? (
          <p id="usuario-email-erro" className="text-sm text-red-700">
            {erros.email}
          </p>
        ) : null}
      </div>
      {id ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="usuario-senha" className="text-sm font-medium text-slate-800">
            Senha inicial
          </label>
          <input
            id="usuario-senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={erros.senha ? true : undefined}
            aria-describedby={`usuario-senha-ajuda${erros.senha ? " usuario-senha-erro" : ""}`}
            className={classe("senha")}
          />
          <p id="usuario-senha-ajuda" className="text-xs text-slate-600">
            A senha deve ter entre 8 e 72 caracteres.
          </p>
          {erros.senha ? (
            <p id="usuario-senha-erro" className="text-sm text-red-700">
              {erros.senha}
            </p>
          ) : null}
        </div>
      )}
      <fieldset className="flex flex-col gap-2" aria-describedby={erros.papeis ? "usuario-papeis-erro" : undefined}>
        <legend className="text-sm font-medium text-slate-800">Papéis (pode marcar mais de um)</legend>
        {PAPEIS_ORDEM.map((p) => (
          <label key={p} className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" name="papeis" value={p} checked={papeis.includes(p)} onChange={() => alternarPapel(p)} className="size-5 accent-marca-600" />
            {ROTULO_PAPEL[p]}
          </label>
        ))}
        {erros.papeis ? (
          <p id="usuario-papeis-erro" className="text-sm text-red-700">
            {erros.papeis}
          </p>
        ) : null}
      </fieldset>
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar usuário"}
        </Botao>
      </div>
    </form>
  );
}
