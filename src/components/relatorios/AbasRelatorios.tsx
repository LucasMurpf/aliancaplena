import Link from "next/link";
import type { FiltrosRelatorioUrl, TipoRelatorioTela } from "@/lib/filtros-relatorio";

const ABAS: { tipo: TipoRelatorioTela; rotulo: string }[] = [
  { tipo: "geral", rotulo: "Geral" },
  { tipo: "arrecadacao", rotulo: "Arrecadação" },
  { tipo: "despesas", rotulo: "Despesas" },
  { tipo: "contribuicoes", rotulo: "Contribuições" },
];

type Props = { ativa: TipoRelatorioTela | "prestacao"; filtros: FiltrosRelatorioUrl; comContribuicoes: boolean };

/** Abas entre relatórios; levam junto só o que vale para todos (período e conta). */
export function AbasRelatorios({ ativa, filtros, comContribuicoes }: Props) {
  const q = new URLSearchParams({ de: filtros.de, ate: filtros.ate });
  if (filtros.contaId) q.set("contaId", filtros.contaId);
  return (
    <nav aria-label="Relatórios" className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
      {ABAS.filter((a) => comContribuicoes || a.tipo !== "contribuicoes").map((a) => (
        <Link
          key={a.tipo}
          href={`/relatorios/${a.tipo}?${q}`}
          aria-current={a.tipo === ativa ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${
            a.tipo === ativa ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"
          }`}
        >
          {a.rotulo}
        </Link>
      ))}
      <Link
        href="/relatorios/prestacao"
        aria-current={ativa === "prestacao" ? "page" : undefined}
        className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${
          ativa === "prestacao" ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"
        }`}
      >
        Prestação de contas
      </Link>
    </nav>
  );
}
