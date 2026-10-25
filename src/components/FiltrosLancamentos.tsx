"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { MembroOpcao } from "@/app/(sistema)/lancamentos/actions";
import { filtrosParaQuery, nomesFiltrosAtivos } from "@/lib/filtros-lancamentos";
import { rastrear } from "@/lib/metricas/cliente";
import type { FiltroLancamentos } from "@/lib/services/lancamentos";
import { SeletorMembro } from "./SeletorMembro";
import { Botao } from "./ui/Botao";
import { BORDA_OK, CLASSE_INPUT } from "./ui/estilos";
import { Selecao } from "./ui/Selecao";

type Props = {
  filtros: FiltroLancamentos;
  categorias: { id: string; nome: string; tipo: "ENTRADA" | "SAIDA" }[];
  contas: { id: string; nome: string }[];
  membro: MembroOpcao | null;
  podeFiltrarMembro: boolean;
  /** Primeiro e último dia do mês atual (aaaa-mm-dd), para o atalho "Este mês". */
  mesAtual: { de: string; ate: string };
};

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

export function FiltrosLancamentos({ filtros, categorias, contas, membro, podeFiltrarMembro, mesAtual }: Props) {
  const router = useRouter();
  const [f, setF] = useState<FiltroLancamentos>({ ...filtros, pagina: 1 });
  const [m, setM] = useState<MembroOpcao | null>(membro);
  const [aberto, setAberto] = useState(false);
  const ativos = nomesFiltrosAtivos(filtros).length;

  const mudar = (parcial: Partial<FiltroLancamentos>) => setF((x) => ({ ...x, ...parcial }));
  const texto = (v: string) => (v === "" ? undefined : v);

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const novo = { ...f, membroId: m?.id, pagina: 1 };
    const nomes = nomesFiltrosAtivos(novo);
    if (nomes.length > 0) rastrear("filtro_usado", { filtros: nomes.join(",") });
    setAberto(false);
    const q = filtrosParaQuery(novo);
    router.push(q ? `/lancamentos?${q}` : "/lancamentos");
  }

  return (
    <section aria-label="Filtros">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="campos-filtro"
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-4 text-sm font-semibold text-marca-900 shadow-sm ring-1 ring-slate-200 md:hidden"
      >
        <span>Filtros{ativos > 0 ? ` (${ativos})` : ""}</span>
        <span aria-hidden="true">{aberto ? "▴" : "▾"}</span>
      </button>
      <form
        id="campos-filtro"
        onSubmit={aplicar}
        className={`${aberto ? "flex" : "hidden md:flex"} mt-3 flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:mt-0`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Campo id="f-de" rotulo="De">
            <input id="f-de" type="date" value={f.de ?? ""} onChange={(e) => mudar({ de: texto(e.target.value) })} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
          </Campo>
          <Campo id="f-ate" rotulo="Até">
            <input id="f-ate" type="date" value={f.ate ?? ""} onChange={(e) => mudar({ ate: texto(e.target.value) })} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
          </Campo>
          <Selecao rotulo="Tipo" name="f-tipo" value={f.tipo ?? ""} onChange={(e) => mudar({ tipo: (texto(e.target.value) as FiltroLancamentos["tipo"]), categoriaId: undefined })}>
            <option value="">Todos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SAIDA">Saídas</option>
          </Selecao>
          <Selecao rotulo="Situação" name="f-status" value={f.status ?? ""} onChange={(e) => mudar({ status: texto(e.target.value) as FiltroLancamentos["status"] })}>
            <option value="">Previstos e realizados</option>
            <option value="REALIZADO">Realizados</option>
            <option value="PREVISTO">Previstos</option>
            <option value="CANCELADO">Cancelados</option>
          </Selecao>
          <Selecao rotulo="Categoria" name="f-categoria" value={f.categoriaId ?? ""} onChange={(e) => mudar({ categoriaId: texto(e.target.value) })}>
            <option value="">Todas</option>
            {categorias
              .filter((c) => !f.tipo || c.tipo === f.tipo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Selecao>
          <Selecao rotulo="Conta" name="f-conta" value={f.contaId ?? ""} onChange={(e) => mudar({ contaId: texto(e.target.value) })}>
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <div className="col-span-2">
            <Campo id="f-busca" rotulo="Buscar na descrição">
              <input id="f-busca" type="search" value={f.busca ?? ""} onChange={(e) => mudar({ busca: texto(e.target.value) })} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
            </Campo>
          </div>
          {podeFiltrarMembro ? (
            <div className="col-span-2 md:col-span-4">
              <SeletorMembro id="f-membro" valor={m} onChange={setM} permitirCadastro={false} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" className="flex-1 md:flex-none">
            Filtrar
          </Botao>
          <Botao variante="secundario" onClick={() => setF((x) => ({ ...x, de: mesAtual.de, ate: mesAtual.ate }))}>
            Este mês
          </Botao>
          <Link
            href="/lancamentos"
            onClick={() => setAberto(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-marca-700 hover:bg-marca-50"
          >
            Limpar
          </Link>
        </div>
      </form>
    </section>
  );
}
