"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { atualizarConfiguracaoAction } from "@/app/(sistema)/configuracoes/igreja/actions";
import { registrarErroAcao } from "@/lib/erro-acao-cliente";
import { destinoDoErro } from "@/lib/form-lancamento";
import { Alerta } from "./ui/Alerta";
import { Botao } from "./ui/Botao";
import { BORDA_ERRO, BORDA_OK, CLASSE_INPUT } from "./ui/estilos";

type Props = {
  inicial: { nomeIgreja: string; logoUrl: string; cnpj: string; cidade: string; metricasAtivas: boolean };
};

const CAMPOS = ["nomeIgreja", "logoUrl", "cnpj", "cidade"];

export function FormIgreja({ inicial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [nomeIgreja, setNomeIgreja] = useState(inicial.nomeIgreja);
  const [logoUrl, setLogoUrl] = useState(inicial.logoUrl);
  const [cnpj, setCnpj] = useState(inicial.cnpj);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [metricasAtivas, setMetricasAtivas] = useState(inicial.metricasAtivas);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    setSalvo(false);
    try {
      const r = await atualizarConfiguracaoAction({ nomeIgreja, logoUrl: logoUrl.trim(), cnpj: cnpj.trim(), cidade: cidade.trim(), metricasAtivas });
      if (!r.ok) {
        registrarErroAcao(r);
        const destino = destinoDoErro(r.campo, CAMPOS);
        if (destino) setErros({ [destino]: r.erro });
        else setErroGeral(r.erro);
        return;
      }
      setSalvo(true);
      router.replace(pathname); // tira o ?salvo=1 da URL e atualiza a tela
    } catch {
      setErroGeral("Algo deu errado, tente novamente");
    } finally {
      setEnviando(false);
    }
  }

  const classe = (c: string) => `${CLASSE_INPUT} ${erros[c] ? BORDA_ERRO : BORDA_OK}`;

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" noValidate>
      {erroGeral ? <Alerta tipo="erro">{erroGeral}</Alerta> : null}
      {salvo ? <Alerta tipo="sucesso">Alterações salvas</Alerta> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="igreja-nome" className="text-sm font-medium text-slate-800">
          Nome da igreja
        </label>
        <input id="igreja-nome" value={nomeIgreja} onChange={(e) => setNomeIgreja(e.target.value)} autoComplete="off" aria-invalid={erros.nomeIgreja ? true : undefined} aria-describedby={erros.nomeIgreja ? "igreja-nome-erro" : undefined} className={classe("nomeIgreja")} />
        {erros.nomeIgreja ? (
          <p id="igreja-nome-erro" className="text-sm text-red-700">
            {erros.nomeIgreja}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="igreja-logo" className="text-sm font-medium text-slate-800">
          Logo (endereço da imagem, opcional)
        </label>
        <input id="igreja-logo" type="url" inputMode="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} autoComplete="off" placeholder="https://" aria-invalid={erros.logoUrl ? true : undefined} aria-describedby={erros.logoUrl ? "igreja-logo-erro" : undefined} className={classe("logoUrl")} />
        {erros.logoUrl ? (
          <p id="igreja-logo-erro" className="text-sm text-red-700">
            {erros.logoUrl}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="igreja-cnpj" className="text-sm font-medium text-slate-800">
          CNPJ (opcional)
        </label>
        <input id="igreja-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} autoComplete="off" maxLength={18} aria-invalid={erros.cnpj ? true : undefined} aria-describedby={erros.cnpj ? "igreja-cnpj-erro" : undefined} className={classe("cnpj")} />
        {erros.cnpj ? (
          <p id="igreja-cnpj-erro" className="text-sm text-red-700">
            {erros.cnpj}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="igreja-cidade" className="text-sm font-medium text-slate-800">
          Cidade (usada no recibo)
        </label>
        <input id="igreja-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="off" maxLength={80} aria-invalid={erros.cidade ? true : undefined} aria-describedby={erros.cidade ? "igreja-cidade-erro" : undefined} className={classe("cidade")} />
        {erros.cidade ? (
          <p id="igreja-cidade-erro" className="text-sm text-red-700">
            {erros.cidade}
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            role="switch"
            checked={metricasAtivas}
            onChange={(e) => setMetricasAtivas(e.target.checked)}
            aria-describedby="igreja-metricas-ajuda"
            className="mt-0.5 size-5 shrink-0 accent-marca-600"
          />
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900">Coletar métricas de uso</span>
            <span id="igreja-metricas-ajuda" className="mt-1 block text-sm text-slate-600">
              Registra como o sistema é usado (telas abertas, tempo para lançar, erros) para melhorar o app. Nunca registra valores, nomes de membros ou descrições.
            </span>
          </span>
        </label>
      </div>
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Salvando…" : "Salvar alterações"}
        </Botao>
      </div>
    </form>
  );
}
