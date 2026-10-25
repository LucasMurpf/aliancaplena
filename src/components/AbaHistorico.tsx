import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import type { Entidade } from "@/lib/log";
import { historicoDe } from "@/lib/services/historico";
import { Alerta } from "./ui/Alerta";

const formato = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Histórico (log de auditoria) de uma entidade. Server component reutilizável:
 * obtém o usuário da sessão e só mostra a quem tem `historico.ver`.
 */
export async function AbaHistorico({ entidade, entidadeId }: { entidade: Entidade; entidadeId: string }) {
  const ator = await obterUsuarioAtual();
  if (!ator) redirect("/login?expirou=1");
  if (!pode(ator.papeis, "historico.ver")) return <Alerta tipo="info">Você não tem acesso ao histórico.</Alerta>;

  const linhas = await historicoDe(ator, entidade, entidadeId);
  if (linhas.length === 0) return <p className="text-sm text-slate-600">Ainda não há registros.</p>;

  const mudanca = (l: (typeof linhas)[number]) =>
    l.de !== null || l.para !== null ? (
      <>
        {l.de !== null ? (
          <>
            <span className="text-slate-600">{l.de}</span>
            <span aria-label="para"> → </span>
          </>
        ) : null}
        <span className="font-medium text-slate-900">{l.para ?? "(vazio)"}</span>
      </>
    ) : null;

  return (
    <div>
      <ul className="flex flex-col divide-y divide-slate-200 md:hidden">
        {linhas.map((l, i) => (
          <li key={i} className="py-3">
            <p className="text-xs text-slate-600">
              {formato.format(l.dataHora)} · {l.usuario}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {l.acao}
              {l.campo ? <span className="font-normal text-slate-700"> — {l.campo}</span> : null}
            </p>
            {mudanca(l) ? <p className="mt-0.5 break-words text-sm">{mudanca(l)}</p> : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-slate-300 text-slate-700">
          <tr>
            <th className="py-2 pr-3 font-semibold">Data e hora</th>
            <th className="py-2 pr-3 font-semibold">Usuário</th>
            <th className="py-2 pr-3 font-semibold">Ação</th>
            <th className="py-2 pr-3 font-semibold">Campo</th>
            <th className="py-2 font-semibold">Mudança</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {linhas.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{formato.format(l.dataHora)}</td>
              <td className="py-2 pr-3">{l.usuario}</td>
              <td className="py-2 pr-3">{l.acao}</td>
              <td className="py-2 pr-3">{l.campo ?? ""}</td>
              <td className="py-2">{mudanca(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
