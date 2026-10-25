"use client";

import { useEffect, useRef, useState } from "react";
import { buscarMembrosAction, cadastrarMembroRapidoAction, type MembroOpcao } from "@/app/(sistema)/lancamentos/actions";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  valor: MembroOpcao | null;
  onChange: (m: MembroOpcao | null) => void;
  rotulo?: string;
  erro?: string;
  /** Mostra "Cadastrar rápido" (só no lançamento; no filtro não). */
  permitirCadastro?: boolean;
  id?: string;
};

export const ESPERA_BUSCA_MS = 300;

export function SeletorMembro({ valor, onChange, rotulo = "Membro", erro, permitirCadastro = true, id = "membro" }: Props) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<MembroOpcao[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pedido = useRef(0);

  // Busca com espera de 300 ms após parar de digitar; respostas atrasadas são ignoradas.
  useEffect(() => {
    if (!aberto) return;
    const numero = ++pedido.current;
    const t = setTimeout(async () => {
      const r = await buscarMembrosAction(termo);
      if (numero !== pedido.current) return;
      if (r.ok) {
        setResultados(r.membros);
        setFalha(null);
      } else {
        setFalha(r.erro);
      }
    }, ESPERA_BUSCA_MS);
    return () => clearTimeout(t);
  }, [termo, aberto]);

  function escolher(m: MembroOpcao) {
    onChange(m);
    setAberto(false);
    setCadastrando(false);
    setTermo("");
    setResultados(null);
  }

  async function cadastrar() {
    setSalvando(true);
    const r = await cadastrarMembroRapidoAction(nome, telefone);
    setSalvando(false);
    if (r.ok) {
      escolher(r.membro);
      setNome("");
      setTelefone("");
    } else {
      setFalha(r.erro);
    }
  }

  if (valor) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-800">{rotulo}</span>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-marca-100 bg-marca-50 pl-3">
          <span className="min-w-0 truncate font-medium text-marca-900">{valor.nome}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 px-3 text-sm font-semibold text-marca-700 hover:underline"
          >
            Trocar
          </button>
        </div>
        {erro ? (
          <p id={`${id}-erro`} role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Buscar pelo nome"
        value={termo}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${CLASSE_INPUT} ${erro ? BORDA_ERRO : BORDA_OK}`}
      />
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-red-700">
          {erro}
        </p>
      ) : null}
      {aberto && !cadastrando ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-live="polite">
          {falha ? <p className="px-3 py-2 text-sm text-red-700">{falha}</p> : null}
          {resultados === null && !falha ? <p className="px-3 py-2 text-sm text-slate-600">Buscando…</p> : null}
          {resultados?.length === 0 ? <p className="px-3 py-2 text-sm text-slate-600">Nenhum membro encontrado.</p> : null}
          <ul>
            {resultados?.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => escolher(m)}
                  className="flex min-h-11 w-full items-center px-3 text-left text-base hover:bg-marca-50"
                >
                  {m.nome}
                </button>
              </li>
            ))}
          </ul>
          {permitirCadastro ? (
            <button
              type="button"
              onClick={() => {
                setNome(termo.trim());
                setCadastrando(true);
              }}
              className="min-h-11 w-full border-t border-slate-200 px-3 text-left text-sm font-semibold text-marca-700 hover:bg-marca-50"
            >
              + Cadastrar rápido
            </button>
          ) : null}
        </div>
      ) : null}
      {cadastrando ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Novo membro</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-nome`} className="text-sm font-medium text-slate-800">
              Nome
            </label>
            <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-tel`} className="text-sm font-medium text-slate-800">
              Telefone (opcional)
            </label>
            <input
              id={`${id}-tel`}
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className={`${CLASSE_INPUT} ${BORDA_OK}`}
            />
          </div>
          {falha ? <p className="text-sm text-red-700">{falha}</p> : null}
          <div className="flex gap-2">
            <Botao onClick={cadastrar} disabled={salvando || !nome.trim()} className="flex-1">
              {salvando ? "Salvando…" : "Cadastrar e selecionar"}
            </Botao>
            <Botao variante="secundario" onClick={() => setCadastrando(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : null}
    </div>
  );
}
