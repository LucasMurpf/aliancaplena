import type { FiltrosRelatorioUrl, TipoRelatorioTela } from "@/lib/filtros-relatorio";
import { Botao } from "../ui/Botao";
import { BORDA_OK, CLASSE_INPUT } from "../ui/estilos";
import { Selecao } from "../ui/Selecao";
import { SeletorMembroRelatorio } from "./SeletorMembroRelatorio";

type Props = {
  tipo: TipoRelatorioTela;
  filtros: FiltrosRelatorioUrl;
  contas: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  membro: { id: string; nome: string } | null;
};

/** Formulário GET: os filtros ficam na URL e funcionam sem JavaScript (exceto a busca de membro). */
export function FiltrosRelatorio({ tipo, filtros, contas, categorias, membro }: Props) {
  return (
    <details open className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-marca-900 md:hidden">
        <span>Filtros</span>
        <span aria-hidden="true" className="group-open:rotate-180">
          ▾
        </span>
      </summary>
      <form method="get" action={`/relatorios/${tipo}`} className="flex flex-col gap-3 p-4 md:pt-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="r-de" className="text-sm font-medium text-slate-800">
              De
            </label>
            <input id="r-de" name="de" type="date" required defaultValue={filtros.de} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="r-ate" className="text-sm font-medium text-slate-800">
              Até
            </label>
            <input id="r-ate" name="ate" type="date" required defaultValue={filtros.ate} className={`${CLASSE_INPUT} ${BORDA_OK}`} />
          </div>
          <Selecao rotulo="Conta" name="contaId" id="r-conta" defaultValue={filtros.contaId ?? ""}>
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Categoria" name="categoriaId" id="r-categoria" defaultValue={filtros.categoriaId ?? ""}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </div>
        {tipo === "geral" ? (
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
            <input type="checkbox" name="incluirPrevistos" value="1" defaultChecked={filtros.incluirPrevistos} className="size-5 accent-marca-600" />
            Incluir lançamentos previstos
          </label>
        ) : null}
        {tipo === "contribuicoes" ? <SeletorMembroRelatorio inicial={membro} /> : null}
        <div className="flex gap-2">
          <Botao type="submit" className="flex-1 md:flex-none">
            Ver relatório
          </Botao>
        </div>
      </form>
    </details>
  );
}
