"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { esperadoAction, registrarContagemAction } from "@/app/(sistema)/calculadora/actions";
import {
  calcularTotalCentavos,
  contaPadraoId,
  DENOMINACOES_CLIENTE,
  descreverDiferenca,
  destinoErroContagem,
  formatarCentavos,
  observacaoParaEnvio,
} from "@/lib/calculadora";
import { rastrear } from "@/lib/metricas/cliente";
import { CampoData } from "../CampoData";
import { Alerta } from "../ui/Alerta";
import { Botao } from "../ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "../ui/estilos";
import { Selecao } from "../ui/Selecao";

type Props = { contas: { id: string; nome: string; tipo: string }[]; hoje: string };
type Modo = "CULTO" | "CAIXA";
type Esperado = { texto: string; centavos: number };

const MAXIMO = 100_000;
const CAMPO_TELA: Record<string, string> = { contaId: "conta" };
const COR = { ok: "text-emerald-700", falta: "text-red-700", sobra: "text-amber-700" } as const;

export function FormContagem({ contas, hoje }: Props) {
  const router = useRouter();
  const idObs = useId();
  const [modo, setModo] = useState<Modo>("CULTO");
  const [contaId, setContaId] = useState(() => contaPadraoId(contas));
  const [data, setData] = useState(hoje);
  const [qtd, setQtd] = useState<Record<number, number>>({});
  const [observacao, setObservacao] = useState("");
  const [esperado, setEsperado] = useState<Esperado | null>(null);
  const [calculando, setCalculando] = useState(true);
  const [erroEsperado, setErroEsperado] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // Esperado: busca no servidor ao trocar modo/conta/data (espera 300 ms de calma).
  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      setErroEsperado(null);
      try {
        const r = await esperadoAction({ modo, contaId, ...(modo === "CULTO" ? { data } : {}) });
        if (cancelado) return;
        if (r.ok) {
          setEsperado({ texto: r.texto, centavos: r.centavos });
        } else {
          setEsperado(null);
          setErroEsperado(r.erro);
        }
      } catch {
        if (cancelado) return;
        setEsperado(null);
        setErroEsperado("Não foi possível calcular o esperado");
      } finally {
        if (!cancelado) setCalculando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [modo, contaId, data, recarga]);

  // Marca "calculando…" já na mudança (o efeito só busca depois da espera de 300 ms).
  const mudarModo = (v: Modo) => {
    setCalculando(true);
    setModo(v);
  };
  const mudarConta = (v: string) => {
    setCalculando(true);
    setContaId(v);
  };
  const mudarData = (v: string) => {
    setCalculando(true);
    setData(v);
  };

  const itens = useMemo(
    () => DENOMINACOES_CLIENTE.map((d) => ({ denominacaoCentavos: d.centavos, quantidade: qtd[d.centavos] ?? 0 })),
    [qtd],
  );
  const contado = calcularTotalCentavos(itens);
  const diferenca = esperado && !calculando ? descreverDiferenca(contado - esperado.centavos) : null;
  const divergente = diferenca !== null && diferenca.estado !== "ok";

  const definir = (centavos: number, n: number) =>
    setQtd((q) => ({ ...q, [centavos]: Math.min(MAXIMO, Math.max(0, Math.trunc(n) || 0)) }));

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || calculando || !esperado) return;
    const obs = observacaoParaEnvio(observacao, contado - esperado.centavos);
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    try {
      const r = await registrarContagemAction({
        modo,
        contaId,
        ...(modo === "CULTO" ? { data } : {}),
        itens: itens.filter((i) => i.quantidade > 0),
        ...(obs !== undefined ? { observacao: obs } : {}),
      });
      if (!r.ok) {
        if (r.campo || r.regra) rastrear("erro_validacao", { campo: r.campo ?? "geral", regra: r.regra ?? "outra" });
        if (r.inesperado) rastrear("erro_inesperado", { campo: "contagem" });
        // Só os campos que estão na tela; o esperado pode ter mudado, então busca de novo.
        const visiveis = ["conta", ...(modo === "CULTO" ? ["data"] : []), ...(divergente ? ["observacao"] : [])];
        const destino = destinoErroContagem(r, visiveis, CAMPO_TELA);
        if (destino.campo) setErros({ [destino.campo]: destino.mensagem });
        else setErroGeral(destino.mensagem);
        setCalculando(true);
        setRecarga((n) => n + 1);
        return;
      }
      router.push(`/calculadora/${r.id}?salvo=1`);
    } catch {
      rastrear("erro_inesperado", { campo: "contagem" });
      setErroGeral("Algo deu errado, tente novamente");
      setCalculando(true);
      setRecarga((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  const botaoModo = (valor: Modo, rotulo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={modo === valor}
      onClick={() => mudarModo(valor)}
      className={`min-h-11 flex-1 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 ${
        modo === valor ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"
      }`}
    >
      {rotulo}
    </button>
  );

  const secao = (titulo: string, tipo: "cedula" | "moeda") => (
    <section aria-label={titulo} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <h2 className="px-1 pb-1 text-base font-semibold text-slate-900">{titulo}</h2>
      <ul className="divide-y divide-slate-100">
        {DENOMINACOES_CLIENTE.filter((d) => d.tipo === tipo).map((d) => {
          const q = qtd[d.centavos] ?? 0;
          const idCampo = `qtd-${d.centavos}`;
          return (
            <li key={d.centavos} className="flex items-center gap-2 py-1.5">
              <label htmlFor={idCampo} className="w-[4.5rem] shrink-0 text-sm font-semibold text-slate-800 tabular-nums">
                {d.rotulo}
              </label>
              <button
                type="button"
                aria-label={`Diminuir ${d.rotulo}`}
                onClick={() => definir(d.centavos, q - 1)}
                disabled={q <= 0}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-40"
              >
                <span aria-hidden="true">−</span>
              </button>
              <input
                id={idCampo}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={6}
                value={q === 0 ? "" : String(q)}
                placeholder="0"
                onChange={(ev) => definir(d.centavos, Number(ev.target.value.replace(/\D/g, "")))}
                onFocus={(ev) => ev.target.select()}
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-1 text-center text-lg font-semibold tabular-nums text-slate-900 focus-visible:border-marca-600 focus-visible:outline-2 focus-visible:outline-marca-600"
              />
              <button
                type="button"
                aria-label={`Aumentar ${d.rotulo}`}
                onClick={() => definir(d.centavos, q + 1)}
                disabled={q >= MAXIMO}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-marca-600 text-2xl font-bold text-white hover:bg-marca-700 disabled:opacity-40"
              >
                <span aria-hidden="true">+</span>
              </button>
              <span className="w-[5.5rem] shrink-0 text-right text-sm tabular-nums text-slate-700" aria-label={`Subtotal de ${d.rotulo}`}>
                {formatarCentavos(q * d.centavos)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4 pb-44" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}

      <div role="radiogroup" aria-label="O que conferir" className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {botaoModo("CULTO", "Conferir culto")}
        {botaoModo("CAIXA", "Conferir caixa")}
      </div>

      <Selecao rotulo="Conta" name="conta" value={contaId} onChange={(e) => mudarConta(e.target.value)} erro={erros.conta}>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      {modo === "CULTO" ? <CampoData rotulo="Data do culto" value={data} onChange={mudarData} erro={erros.data} /> : null}
      <p className="text-sm text-slate-600">
        {modo === "CULTO"
          ? "Esperado: soma das entradas realizadas da conta nessa data."
          : "Esperado: saldo atual da conta."}
      </p>

      {secao("Cédulas", "cedula")}
      {secao("Moedas", "moeda")}

      {divergente ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={idObs} className="text-sm font-medium text-slate-800">
            Observação (obrigatória: explique a diferença)
          </label>
          <textarea
            id={idObs}
            rows={3}
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            aria-invalid={erros.observacao ? true : undefined}
            aria-describedby={erros.observacao ? `${idObs}-erro` : undefined}
            className={`${CLASSE_INPUT} py-2 ${erros.observacao ? BORDA_ERRO : BORDA_OK}`}
          />
          {erros.observacao ? (
            <p id={`${idObs}-erro`} className="text-sm text-red-700">
              {erros.observacao}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:left-64 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-2 text-center">
            <div>
              <dt className="text-xs text-slate-600">Contado</dt>
              <dd className="text-sm font-bold tabular-nums text-slate-900">{formatarCentavos(contado)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Esperado</dt>
              <dd className="text-sm font-bold tabular-nums text-slate-900">
                {calculando ? "calculando…" : esperado ? esperado.texto : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Diferença</dt>
              <dd aria-live="polite" className={`text-sm font-bold tabular-nums ${diferenca ? COR[diferenca.estado] : "text-slate-500"}`}>
                {calculando ? "…" : diferenca ? diferenca.texto : "—"}
              </dd>
            </div>
          </dl>
          {erroEsperado ? <p className="text-center text-xs text-red-700">{erroEsperado}</p> : null}
          <Botao type="submit" disabled={enviando || calculando || !esperado} className="w-full">
            {enviando ? "Registrando…" : "Registrar contagem"}
          </Botao>
        </div>
      </div>
    </form>
  );
}
