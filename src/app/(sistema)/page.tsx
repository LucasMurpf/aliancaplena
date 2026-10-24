import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { CardsResumo } from "@/components/dashboard/CardsResumo";
import { GraficoCategorias, type BarraCategoria } from "@/components/dashboard/GraficoCategorias";
import { ListaAlertas, type AlertaView } from "@/components/dashboard/ListaAlertas";
import { obterUsuarioAtual } from "@/lib/auth";
import {
  agruparTopComOutras,
  chaveMes,
  mesAnterior,
  mesSeguinte,
  parseMes,
  rotuloMes,
  type MesRef,
} from "@/lib/dashboard";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { alertas, resumoMes, saldoPorConta, type AlertaItem, type TotalCategoria } from "@/lib/services/resumo";

type Props = { searchParams: Promise<{ mes?: string | string[] }> };

const ROTULO_TIPO_CONTA = { CAIXA: "Caixa", BANCO: "Banco" } as const;

function barras(itens: TotalCategoria[], total: Prisma.Decimal): BarraCategoria[] {
  return agruparTopComOutras(itens).map((i) => ({
    nome: i.categoria,
    valor: formatarBRL(i.total),
    percentual: total.isZero() ? "0%" : `${i.total.div(total).mul(100).toDecimalPlaces(0).toString()}%`,
    barra: i.total.toNumber(), // só geometria da barra
    outras: Boolean(i.outras),
  }));
}

function alertaView(a: AlertaItem): AlertaView {
  return {
    id: a.id,
    descricao: a.descricao?.trim() || a.categoria,
    categoria: a.categoria,
    valor: formatarBRL(a.valor),
    vencimento: formatarDataBR(a.dataVencimento),
    tipoRotulo: a.tipo === "ENTRADA" ? "A receber" : "A pagar",
  };
}

function SetaMes({ mes, simbolo, rotulo }: { mes: MesRef | null; simbolo: string; rotulo: string }) {
  const base = "flex size-11 items-center justify-center rounded-full text-2xl leading-none";
  if (!mes) {
    return (
      <span aria-hidden="true" className={`${base} text-slate-300`}>
        {simbolo}
      </span>
    );
  }
  return (
    <Link
      href={`/?mes=${chaveMes(mes)}`}
      aria-label={`${rotulo}: ${rotuloMes(mes)}`}
      className={`${base} text-marca-700 hover:bg-marca-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600`}
    >
      {simbolo}
    </Link>
  );
}

export default async function PaginaInicio({ searchParams }: Props) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login?expirou=1");
  if (!pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");

  const mes = parseMes((await searchParams).mes, hojeSP());
  const [contas, resumo, avisos] = await Promise.all([
    saldoPorConta(usuario),
    resumoMes(usuario, mes.ano, mes.mes),
    alertas(usuario),
  ]);
  const saldoTotal = contas.reduce((s, c) => s.add(c.saldo), new Prisma.Decimal(0));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-marca-900">Início</h1>
        <nav aria-label="Mês" className="flex items-center">
          <SetaMes mes={mesAnterior(mes)} simbolo="‹" rotulo="Mês anterior" />
          <p className="min-w-36 text-center text-base font-semibold text-slate-900 first-letter:uppercase" aria-live="polite">
            {rotuloMes(mes)}
          </p>
          <SetaMes mes={mesSeguinte(mes)} simbolo="›" rotulo="Próximo mês" />
        </nav>
      </header>

      <CardsResumo
        entradas={formatarBRL(resumo.entradas)}
        saidas={formatarBRL(resumo.saidas)}
        resultado={formatarBRL(resumo.resultado)}
        resultadoNegativo={resumo.resultado.isNegative()}
        saldoTotal={formatarBRL(saldoTotal)}
        saldoNegativo={saldoTotal.isNegative()}
        contas={contas.map((c) => ({
          id: c.contaId,
          nome: c.nome,
          tipo: ROTULO_TIPO_CONTA[c.tipo],
          saldo: formatarBRL(c.saldo),
          negativo: c.saldo.isNegative(),
        }))}
      />

      <ListaAlertas vencidos={avisos.vencidos.map(alertaView)} proximos={avisos.proximos.map(alertaView)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoCategorias
          titulo="Entradas por categoria"
          grafico="entradas"
          cor="#059669"
          total={formatarBRL(resumo.entradas)}
          itens={barras(resumo.porCategoriaEntrada, resumo.entradas)}
        />
        <GraficoCategorias
          titulo="Saídas por categoria"
          grafico="saidas"
          cor="#dc2626"
          total={formatarBRL(resumo.saidas)}
          itens={barras(resumo.porCategoriaSaida, resumo.saidas)}
        />
      </div>
    </div>
  );
}
