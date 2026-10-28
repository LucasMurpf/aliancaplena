import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";
import { ErroApp } from "@/lib/erros";
import { lerFiltrosRelatorio, queryRelatorio, type TipoRelatorioTela } from "@/lib/filtros-relatorio";
import { pode } from "@/lib/permissoes";
import { buscarRelatorio } from "@/lib/rotas/relatorio";
import { listarCategorias, listarContas, obterMembro } from "@/lib/services/cadastros";
import { Alerta } from "../ui/Alerta";
import { AbasRelatorios } from "./AbasRelatorios";
import { CorpoArrecadacao, CorpoContribuicoes, CorpoDespesas, CorpoGeral } from "./CorpoRelatorio";
import { FiltrosRelatorio } from "./FiltrosRelatorio";

type Props = { tipo: TipoRelatorioTela; searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITULOS: Record<TipoRelatorioTela, string> = {
  geral: "Relatório geral",
  arrecadacao: "Arrecadação por categoria",
  despesas: "Despesas por categoria",
  contribuicoes: "Contribuições individuais",
};

const classeBaixar =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:flex-none";

/** Corpo comum das quatro telas (sessão, permissão, filtros da URL, dados e downloads). */
export async function PaginaRelatorio({ tipo, searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  const verNomes = pode(usuario.papeis, "membros.ver_nomes");
  if (tipo === "contribuicoes" && !verNomes) redirect("/relatorios/geral");

  const filtros = lerFiltrosRelatorio(await searchParams, tipo, hojeSP());
  const [contas, todasCategorias, membro] = await Promise.all([
    listarContas(usuario, { incluirInativas: true }),
    listarCategorias(usuario, { incluirInativas: true }),
    filtros.membroId ? obterMembro(usuario, filtros.membroId).catch((e) => (e instanceof ErroApp ? null : Promise.reject(e))) : null,
  ]);
  const categorias = todasCategorias.filter((c) =>
    tipo === "arrecadacao" ? c.tipo === "ENTRADA" : tipo === "despesas" ? c.tipo === "SAIDA" : tipo === "contribuicoes" ? c.nominal && c.tipo === "ENTRADA" : true,
  );

  // Erros de validação (período invertido/longo, conta inexistente…) viram aviso na própria tela.
  let dados: Awaited<ReturnType<typeof buscarRelatorio>> | null = null;
  let aviso: string | null = null;
  try {
    dados = await buscarRelatorio(usuario, tipo, filtros);
  } catch (e) {
    if (e instanceof ErroApp && (e.codigo === "VALIDACAO" || e.codigo === "NAO_ENCONTRADO")) aviso = e.message;
    else throw e;
  }

  const query = queryRelatorio(filtros);
  const queryBase = queryRelatorio({ ...filtros, membroId: undefined });

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-8">
      <header>
        <h1 className="text-2xl font-bold text-marca-900">Relatórios</h1>
        <p className="text-sm text-slate-600">{TITULOS[tipo]}</p>
      </header>
      <AbasRelatorios ativa={tipo} filtros={filtros} comContribuicoes={verNomes} />
      <FiltrosRelatorio tipo={tipo} filtros={filtros} contas={contas.map((c) => ({ id: c.id, nome: c.nome }))} categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))} membro={membro ? { id: membro.id, nome: membro.nome } : null} />

      {aviso ? (
        <Alerta tipo="erro">{aviso}</Alerta>
      ) : dados ? (
        <>
          <p className="text-sm text-slate-700">
            Período: <span className="font-medium">{dados.rotuloPeriodo}</span>
            {dados.conta ? ` · Conta: ${dados.conta}` : ""}
            {dados.categoria ? ` · Categoria: ${dados.categoria}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/pdf/relatorio/${tipo}?${query}`} className={classeBaixar}>
              Baixar PDF
            </a>
            <a href={`/api/csv/relatorio/${tipo}?${query}`} className={classeBaixar}>
              Baixar CSV
            </a>
          </div>
          {tipo === "geral" ? <CorpoGeral r={dados as never} incluirPrevistos={filtros.incluirPrevistos} /> : null}
          {tipo === "arrecadacao" ? <CorpoArrecadacao r={dados as never} /> : null}
          {tipo === "despesas" ? <CorpoDespesas r={dados as never} /> : null}
          {tipo === "contribuicoes" ? <CorpoContribuicoes r={dados as never} queryBase={queryBase} /> : null}
        </>
      ) : null}
    </div>
  );
}
