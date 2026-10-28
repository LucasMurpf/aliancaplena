import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import type {
  RelatorioArrecadacao,
  RelatorioContribuicoes,
  RelatorioDespesas,
  RelatorioGeral,
} from "@/lib/services/relatorios";
import { TabelaResponsiva } from "./TabelaResponsiva";

const pct = (d: Prisma.Decimal) => `${d.toFixed(2).replace(".", ",")}%`;

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
      <p className="font-semibold text-slate-900">{children}</p>
      <p className="mt-1 text-sm text-slate-600">Mude o período ou os filtros.</p>
    </div>
  );
}

function Total({ rotulo, valor, tom }: { rotulo: string; valor: string; tom: "entrada" | "saida" | "neutro" }) {
  const cor = tom === "entrada" ? "text-emerald-700" : tom === "saida" ? "text-red-700" : "text-marca-900";
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <dt className="text-xs text-slate-600">{rotulo}</dt>
      <dd className={`text-lg font-bold tabular-nums ${cor}`}>{valor}</dd>
    </div>
  );
}

const Selo = () => <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Previsto</span>;

export function CorpoGeral({ r, incluirPrevistos }: { r: RelatorioGeral; incluirPrevistos: boolean }) {
  return (
    <div className="space-y-3">
      {incluirPrevistos ? <p className="text-sm font-medium text-amber-900">Inclui lançamentos previstos</p> : null}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Total rotulo="Entradas" valor={formatarBRL(r.totalEntradas)} tom="entrada" />
        <Total rotulo="Saídas" valor={formatarBRL(r.totalSaidas)} tom="saida" />
        <Total rotulo="Resultado" valor={formatarBRL(r.resultado)} tom="neutro" />
      </dl>
      {r.linhas.length === 0 ? (
        <Vazio>Nenhum lançamento no período</Vazio>
      ) : (
        <TabelaResponsiva
          legenda="Lançamentos do período"
          colunas={[{ rotulo: "Descrição" }, { rotulo: "Data" }, { rotulo: "Categoria" }, { rotulo: "Conta" }, { rotulo: "Valor", direita: true }]}
          linhas={r.linhas.map((l, i) => {
            const entrada = l.tipo === "ENTRADA";
            return {
              chave: String(i),
              celulas: [
                <span key="d">
                  {l.descricao?.trim() || l.categoria}
                  {l.previsto ? <Selo /> : null}
                </span>,
                formatarDataBR(l.data),
                l.categoria,
                l.conta,
                <span key="v" className={`font-bold ${entrada ? "text-emerald-700" : "text-red-700"}`}>
                  {entrada ? "+" : "−"} {formatarBRL(l.valor)}
                </span>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}

export function CorpoArrecadacao({ r }: { r: RelatorioArrecadacao }) {
  if (r.categorias.length === 0) return <Vazio>Nenhuma entrada no período</Vazio>;
  return (
    <TabelaResponsiva
      legenda="Arrecadação por categoria"
      colunas={[{ rotulo: "Categoria" }, { rotulo: "Lançamentos", direita: true }, { rotulo: "% do total", direita: true }, { rotulo: "Total", direita: true }]}
      linhas={r.categorias.map((c) => ({
        chave: c.categoria,
        celulas: [c.categoria, String(c.quantidade), pct(c.percentual), formatarBRL(c.total)],
      }))}
      rodape={["Total", String(r.categorias.reduce((a, c) => a + c.quantidade, 0)), "100,00%", formatarBRL(r.total)]}
    />
  );
}

export function CorpoDespesas({ r }: { r: RelatorioDespesas }) {
  if (r.grupos.length === 0) return <Vazio>Nenhuma despesa no período</Vazio>;
  return (
    <div className="space-y-5">
      {r.grupos.map((g) => (
        <section key={g.categoria} aria-label={g.categoria} className="space-y-2">
          <h2 className="text-base font-semibold text-marca-900">{g.categoria}</h2>
          <TabelaResponsiva
            legenda={`Despesas de ${g.categoria}`}
            colunas={[{ rotulo: "Descrição" }, { rotulo: "Data" }, { rotulo: "Conta" }, { rotulo: "Valor", direita: true }]}
            linhas={g.itens.map((l, i) => ({
              chave: String(i),
              celulas: [l.descricao?.trim() || g.categoria, formatarDataBR(l.data), l.conta, formatarBRL(l.valor)],
            }))}
            rodape={["Subtotal", "", "", formatarBRL(g.subtotal)]}
          />
        </section>
      ))}
      <p className="flex justify-between gap-3 rounded-xl bg-marca-600 px-4 py-3 text-base font-bold text-white">
        <span>Total de despesas</span>
        <span className="tabular-nums">{formatarBRL(r.total)}</span>
      </p>
    </div>
  );
}

export function CorpoContribuicoes({ r, queryBase }: { r: RelatorioContribuicoes; queryBase: string }) {
  if ("porMembro" in r) {
    if (r.porMembro.length === 0) return <Vazio>Nenhuma contribuição nominal no período</Vazio>;
    return (
      <TabelaResponsiva
        legenda="Contribuições por membro"
        colunas={[{ rotulo: "Membro" }, { rotulo: "Lançamentos", direita: true }, { rotulo: "Total", direita: true }]}
        linhas={r.porMembro.map((m) => ({
          chave: m.membroId,
          celulas: [
            <Link key="m" href={`/relatorios/contribuicoes?${queryBase}&membroId=${encodeURIComponent(m.membroId)}`} className="font-semibold text-marca-700 hover:underline">
              {m.membro}
            </Link>,
            String(m.quantidade),
            formatarBRL(m.total),
          ],
        }))}
        rodape={["Total", String(r.porMembro.reduce((a, m) => a + m.quantidade, 0)), formatarBRL(r.total)]}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-marca-900">{r.membro}</h2>
        <Link href={`/relatorios/contribuicoes?${queryBase}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca-700 hover:underline">
          Ver todos os membros
        </Link>
      </div>
      {r.itens.length === 0 ? (
        <Vazio>Nenhuma contribuição deste membro no período</Vazio>
      ) : (
        <TabelaResponsiva
          legenda={`Contribuições de ${r.membro}`}
          colunas={[{ rotulo: "Data" }, { rotulo: "Categoria" }, { rotulo: "Valor", direita: true }]}
          linhas={r.itens.map((l, i) => ({ chave: String(i), celulas: [formatarDataBR(l.data), l.categoria, formatarBRL(l.valor)] }))}
          rodape={["Total", "", formatarBRL(r.total)]}
        />
      )}
    </div>
  );
}
