"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  anexarArquivoAction,
  editarLancamentoAction,
  salvarLancamentoAction,
} from "@/app/(sistema)/lancamentos/actions";
import {
  aposSalvarELancarOutro,
  destinoDoErro,
  enviarAnexos,
  estadoInicial,
  formularioPreenchido,
  montarDados,
  trocarTipo,
  type CategoriaForm,
  type EstadoLancamento,
} from "@/lib/form-lancamento";
import { descarregarMetricas, rastrear } from "@/lib/metricas/cliente";
import { CampoData } from "./CampoData";
import { CampoDinheiro } from "./CampoDinheiro";
import { SeletorMembro } from "./SeletorMembro";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_OK, CLASSE_INPUT } from "./ui/estilos";
import { Selecao } from "./ui/Selecao";
import { UploadAnexos } from "./UploadAnexos";

type Props = {
  contas: { id: string; nome: string }[];
  categorias: CategoriaForm[];
  /** aaaa-mm-dd (hoje em São Paulo). */
  hoje: string;
  /** Aberto pelo botão flutuante ➕. */
  viaAtalho?: boolean;
  /** Presente na edição. */
  edicao?: { id: string; estado: EstadoLancamento; vencimentoOriginal?: string };
};

// Campos do serviço → campo da tela.
const CAMPO_TELA: Record<string, string> = { dataVencimento: "data", dataRealizacao: "data" };

export function FormLancamento({ contas, categorias, hoje, viaAtalho = false, edicao }: Props) {
  const router = useRouter();
  const novo = !edicao;
  const [estado, setEstado] = useState<EstadoLancamento>(
    () => edicao?.estado ?? estadoInicial({ hoje, contaId: contas[0]?.id ?? "" }),
  );
  const [anexos, setAnexos] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvoMsg, setSalvoMsg] = useState(false);
  const [enviando, setEnviando] = useState<null | "salvar" | "outro">(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const inicio = useRef(0);
  const salvo = useRef(false);
  const ultimo = useRef({ estado, anexos: 0 });

  useEffect(() => {
    ultimo.current = { estado, anexos: anexos.length };
  });

  // Métricas: início do preenchimento e abandono (saiu com algo preenchido sem salvar).
  useEffect(() => {
    if (!novo) return;
    inicio.current = Date.now();
    rastrear("lancamento_iniciado", { tipo: ultimo.current.estado.tipo });
    const abandonou = () => {
      if (salvo.current) return;
      if (formularioPreenchido(ultimo.current.estado, ultimo.current.anexos)) {
        rastrear("lancamento_abandonado", { tipo: ultimo.current.estado.tipo });
        void descarregarMetricas();
        salvo.current = true; // evita contar duas vezes (pagehide + desmontagem)
      }
    };
    window.addEventListener("pagehide", abandonou);
    return () => {
      window.removeEventListener("pagehide", abandonou);
      abandonou();
    };
  }, [novo]);

  const categoriasDoTipo = categorias.filter((c) => c.tipo === estado.tipo);
  const categoria = categorias.find((c) => c.id === estado.categoriaId);

  function mudar(parcial: Partial<EstadoLancamento>) {
    setEstado((e) => ({ ...e, ...parcial }));
  }

  async function enviar(outro: boolean) {
    if (enviando) return;
    salvo.current = false;
    setEnviando(outro ? "outro" : "salvar");
    setErros({});
    setErroGeral(null);
    setSalvoMsg(false);
    try {
      const dados = montarDados(estado, categorias, edicao?.vencimentoOriginal);
      const r = edicao ? await editarLancamentoAction(edicao.id, dados) : await salvarLancamentoAction(dados);
      if (!r.ok) {
        if (r.campo || r.regra) rastrear("erro_validacao", { campo: r.campo ?? "geral", regra: r.regra ?? "outra" });
        if (r.inesperado) rastrear("erro_inesperado", { campo: "lancamento" });
        const tela = ["valor", "categoria", "conta", "data", ...(categoria?.nominal ? ["membro"] : [])];
        const destino = destinoDoErro(r.campo, tela, CAMPO_TELA);
        if (destino) setErros({ [destino]: r.erro });
        else setErroGeral(r.erro);
        return;
      }
      const id = r.id;
      // O lançamento já está salvo: qualquer falha de anexo (inclusive exceção) é só um aviso.
      const falhas = await enviarAnexos(anexos, (arquivo) => {
        const fd = new FormData();
        fd.append("arquivo", arquivo);
        return anexarArquivoAction(id, fd);
      });
      salvo.current = true;
      if (novo) {
        rastrear(
          "lancamento_salvo",
          { tipo: estado.tipo, comAnexo: anexos.length > 0, salvarELancarOutro: outro, viaAtalho },
          Date.now() - inicio.current,
        );
      }
      if (falhas.length > 0) {
        router.push(`/lancamentos/${id}?aviso=anexo`);
        return;
      }
      if (novo && outro) {
        setEstado(aposSalvarELancarOutro(estado));
        setAnexos([]);
        setSalvoMsg(true);
        salvo.current = false;
        inicio.current = Date.now();
        rastrear("lancamento_iniciado", { tipo: estado.tipo });
        valorRef.current?.focus();
        return;
      }
      router.push(`/lancamentos/${id}?salvo=1`);
    } catch {
      rastrear("erro_inesperado", { campo: "lancamento" });
      setErroGeral("Algo deu errado, tente novamente");
    } finally {
      setEnviando(null);
    }
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    void enviar(false);
  }

  const botaoTipo = (tipo: "ENTRADA" | "SAIDA", rotulo: string, ativo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={estado.tipo === tipo}
      onClick={() => setEstado((e) => trocarTipo(e, tipo, categorias))}
      className={`min-h-14 flex-1 rounded-xl text-lg font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 ${
        estado.tipo === tipo ? ativo : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
      }`}
    >
      {rotulo}
    </button>
  );
  const botaoSituacao = (realizado: boolean, rotulo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={estado.realizado === realizado}
      onClick={() => mudar({ realizado })}
      className={`min-h-11 flex-1 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 ${
        estado.realizado === realizado
          ? realizado
            ? "bg-marca-600 text-white"
            : "bg-amber-500 text-white"
          : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
      {salvoMsg ? <Alerta tipo="sucesso">Lançamento salvo</Alerta> : null}
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}

      <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
        {botaoTipo("ENTRADA", "Entrada", "bg-emerald-600 text-white")}
        {botaoTipo("SAIDA", "Saída", "bg-red-600 text-white")}
      </div>

      <CampoDinheiro
        value={estado.valor}
        onChange={(valor) => {
          mudar({ valor });
          setSalvoMsg(false);
        }}
        erro={erros.valor}
        inputRef={valorRef}
      />

      <Selecao
        rotulo="Categoria"
        name="categoria"
        value={estado.categoriaId}
        onChange={(e) => setEstado((s) => ({ ...s, categoriaId: e.target.value, membro: null }))}
        erro={erros.categoria}
      >
        <option value="">Escolha a categoria</option>
        {categoriasDoTipo.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>

      {categoria?.nominal ? (
        <SeletorMembro valor={estado.membro} onChange={(membro) => mudar({ membro })} erro={erros.membro} />
      ) : null}

      <Selecao rotulo="Conta" name="conta" value={estado.contaId} onChange={(e) => mudar({ contaId: e.target.value })} erro={erros.conta}>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>

      {novo ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-800">Situação</span>
          <div role="radiogroup" aria-label="Situação" className="flex gap-2">
            {botaoSituacao(true, "Realizado")}
            {botaoSituacao(false, "Previsto")}
          </div>
        </div>
      ) : null}

      <CampoData
        rotulo={estado.realizado ? "Data" : "Vencimento"}
        value={estado.data}
        onChange={(data) => mudar({ data })}
        erro={erros.data}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="descricao" className="text-sm font-medium text-slate-800">
          Descrição (opcional)
        </label>
        <input
          id="descricao"
          value={estado.descricao}
          onChange={(e) => mudar({ descricao: e.target.value })}
          autoComplete="off"
          className={`${CLASSE_INPUT} ${BORDA_OK}`}
        />
      </div>

      {novo ? <UploadAnexos arquivos={anexos} onChange={setAnexos} /> : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:rounded-xl sm:border sm:px-3">
        <Botao type="submit" disabled={enviando !== null} className="flex-1">
          {enviando === "salvar" ? "Salvando…" : "Salvar"}
        </Botao>
        {novo ? (
          <Botao variante="secundario" disabled={enviando !== null} onClick={() => void enviar(true)} className="flex-1">
            {enviando === "outro" ? "Salvando…" : "Salvar e lançar outro"}
          </Botao>
        ) : (
          <Link
            href={`/lancamentos/${edicao.id}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-marca-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
